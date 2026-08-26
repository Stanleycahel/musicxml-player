export default class Scheduler {
   constructor(player) {
    

        this.player = player;

        this.events = [];

       // časovače Scheduleru
       this.noteOnTimers = [];
       this.noteOffTimers = [];
       this.pedalTimers = [];
       this.finishTimer = null;

        this.isPlaying = false;
        
        this.isPaused = false;
        
        this.tempoEvents = [];

        this.onFinished = null;
        
        this.onNote = null;
        
        this.currentTick = -1;

        this.onTickChanged = null;
        this.resumeMeasure = 0;
        this.loopStart = null;
        this.loopEnd = null;
        

    }
    
     setTickChangedCallback(callback) {
    this.onTickChanged = callback;
}
    play(
    events,
    bpm = 120,
    tempoEvents = [],
    measureEvents = [],
    loopStart = null,
    loopEnd = null,
    pedalEvents = [],
    repeatSections = [],
    navigation = null,
    playbackStartTick = 0
) {

    this.stop();

    this.events = events;
    this.tempoEvents = tempoEvents;
    this.measureEvents = measureEvents;
    this.pedalEvents = pedalEvents;
        this.repeatSections = (repeatSections || []).map(repeat => ({
            ...repeat,
            endings: (repeat.endings || []).map(ending => ({ ...ending }))
        }));

    this.navigation = navigation || null;

    this.playbackStartTick =
        Number.isFinite(playbackStartTick)
            ? playbackStartTick
            : 0;

    this.bpm = bpm;
    this.loopStart = loopStart;
    this.loopEnd = loopEnd;

console.log(
    "Scheduler LOOP:",
    this.loopStart,
    "→",
    this.loopEnd
);

        this.isPlaying = true;
        
        this.isPaused = false;
        this.playStartedAt = performance.now();

       this.scheduleEvents(this.playbackStartTick);


      

    }
    
   scheduleEvents(startTick = 0) { 
 
   
   this.noteOnTimers.length = 0;
this.noteOffTimers.length = 0;

for (const id of this.pedalTimers) {
    clearTimeout(id);
}
this.pedalTimers.length = 0;

if (this.finishTimer) {

    clearTimeout(this.finishTimer);
    this.finishTimer = null;

}

    const divisions = this.getDivisions();

let endTime = 0;

let loopEndTick = null;

if (this.loopStart !== null && this.loopEnd !== null) {

    const loopEndEvent = this.events.find(
        event => event.measure === this.loopEnd
    );

    if (loopEndEvent) {

        const nextMeasureEvent = this.events.find(
    event => event.measure === this.loopEnd + 1
);

loopEndTick = nextMeasureEvent
    ? nextMeasureEvent.tick
    : this.events[this.events.length - 1].tick +
      this.events[this.events.length - 1].duration;

        console.log(
            "LOOP hranice:",
            this.loopStart,
            "→",
            this.loopEnd,
            "tick:",
            loopEndTick
        );
    }
}
    
    
    
   /*
    * Zvýraznění taktů musí používat stejnou časovou osu jako noty.
    * Při opakování proto nestačí naplánovat measureEvents jen jednou:
    * stejný takt se může objevit znovu při dalším průchodu.
    */
   for (const occurrence of this.buildMeasureOccurrences(
        startTick,
        loopEndTick
   )) {

    const measureEvent = occurrence.event;

    const measureTime =
        occurrence.offset +
        (
            this.getTimeAtTick(measureEvent.tick) -
            this.getTimeAtTick(occurrence.segmentStart)
        );

    this.addNoteOnTimer(

        setTimeout(() => {

            if (!this.isPlaying)
                return;

            this.currentMeasure = measureEvent.measure;

            if (this.onMeasureChanged) {

                this.onMeasureChanged(measureEvent.measure);

            }

        }, Math.max(0, measureTime))

    );

}
    // ------------------------------------------------
    // KLAVÍRNÍ PEDÁL
    // ------------------------------------------------

    if (this.pedalEvents && this.pedalEvents.length) {

        for (const occurrence of this.getPedalOccurrences(
            startTick,
            loopEndTick
        )) {

            const pedalEvent = occurrence.event;

            const pedalTime =
                occurrence.offset +
                (
                    this.getTimeAtTick(pedalEvent.tick) -
                    this.getTimeAtTick(occurrence.segmentStart)
                );

            const timer = setTimeout(() => {

                if (!this.isPlaying)
                    return;

                this.applyPedal(pedalEvent);

            }, Math.max(0, pedalTime));

            this.pedalTimers.push(timer);
        }
    }

    const scheduledArpeggios = new Set();

    // Fermata se vyhodnocuje po celém časovém okamžiku (ticku).
    // Tím zajistíme, že všechny tóny jednoho akordu začnou současně
    // a teprve následující tick se posune o prodloužení fermaty.
    /*
     * FERMATA – globální časová osa
     *
     * Fermata je vlastnost hudebního okamžiku, ne jednotlivé osnovy.
     * MusicXML ji může zapsat pouze v jednom partu/osnově a přesto
     * musí zastavit všechny party současně.
     *
     * Proto nejdříve sesbíráme fermaty podle ticku a každý tick
     * prodloužíme právě jednou.
     */
    const fermataByTick = new Map();

    for (const event of this.events) {

        if (!event.fermata)
            continue;

        const duration =
            this.getTimeAtTick(
                event.tick + event.duration
            ) -
            this.getTimeAtTick(event.tick);

        const extra =
            duration * 0.5;

        const previous =
            fermataByTick.get(event.tick) || 0;

        // Pokud je fermata zapsaná ve více partech, nesčítáme ji.
        fermataByTick.set(
            event.tick,
            Math.max(previous, extra)
        );
    }

    /*
     * Fermata je součást globální časové osy.
     * Posun se počítá podle ticků, takže se týká všech partů/osnov.
     */
    const getFermataDelayBeforeTick = (
        segmentStart,
        tick
    ) => {

        let delay = 0;

        for (const [fermataTick, extra] of fermataByTick) {

            if (
                fermataTick >= segmentStart &&
                fermataTick < tick
            ) {
                delay += extra;
            }
        }

        return delay;
    };

    const scheduledGlissandos = new Set();

    const glissandoStopsHandled = new Set();

    for (const occurrence of this.buildPlaybackOccurrences(
        startTick,
        loopEndTick
    )) {

    const event = occurrence.event;

    if (event.rest)
        continue;


    // ------------------------------------------------
    // TIE
    // ------------------------------------------------

    // Pokud je tato nota pouze pokračováním Tie
    // a není zároveň jeho začátkem,
    // nový noteOn se NEHRAJE.
    if (event.tieStop) {

        continue;

    }


    // ------------------------------------------------
    // ZAČÁTEK TÓNU
    // ------------------------------------------------

    const noteOnTime =
        occurrence.offset +
        (
            this.getTimeAtTick(event.tick) -
            this.getTimeAtTick(occurrence.segmentStart)
        ) +
        getFermataDelayBeforeTick(
            occurrence.segmentStart,
            event.tick
        );


    // ------------------------------------------------
    // KONEC TÓNU
    // ------------------------------------------------

    const endTick =
    this.findTieEndTick(event);


// ------------------------------------------------
// ARTIKULACE – délka zaznění
// ------------------------------------------------

let articulationLength = 1.0;

const articulations =
    this.getChordArticulations(event);

if (articulations.includes("staccatissimo")) {

    articulationLength = 0.15;

} else if (articulations.includes("staccato")) {

    articulationLength = 0.30;

} else if (articulations.includes("tenuto")) {

    articulationLength = 1.00;

}


// ------------------------------------------------
// KONEC TÓNU
// ------------------------------------------------

// Pokud není artikulace, použijeme původní konec.
// U artikulované noty zkrátíme pouze dobu zaznění.

// Délka samotné noty musí být počítaná od jejího
// skutečného ticku, ne od začátku celého přehrávání.
// U opakování je occurrence.offset posunutý do dalšího
// průchodu, takže původní výpočet mohl posílat NOTE OFF
// do špatného průchodu a vytvářet překrývající se zvuk.
let noteDurationTime =
    this.getTimeAtTick(endTick) -
    this.getTimeAtTick(event.tick);

    /*
     * Prodloužení samotného tónu při fermatě.
     * Časový posun pro ostatní party se řeší globálně
     * přes fermataByTick výše.
     */
    if (event.fermata) {
        noteDurationTime *= 1.3;
    }

    
    // ------------------------------------------------
// SLIDE – skutečně plynulé sklouznutí
// ------------------------------------------------

if (
    event.slideStart &&
    event.midi !== null
) {

    const slideKey =
        `${event.part}-${event.voice}-${event.staff}-${event.tick}-${event.slideStartNumber}`;

    if (!scheduledGlissandos.has(slideKey)) {

        const endEvent =
            this.findSlideEnd(event);

        if (
            endEvent &&
            endEvent.midi !== null &&
            endEvent.tick > event.tick
        ) {

            scheduledGlissandos.add(slideKey);

            const endKey =
                `${endEvent.part}-${endEvent.tick}-${endEvent.slideStopNumber}`;

            glissandoStopsHandled.add(endKey);

            this.scheduleSlide(
                event,
                endEvent,
                noteOnTime
            );

            const targetEndTime =
                this.getTimeAtTick(
                    this.findTieEndTick(endEvent)
                ) -
                this.getTimeAtTick(startTick);

            endTime =
                Math.max(
                    endTime,
                    targetEndTime
                );

            continue;
        }
    }
}

if (event.slideStop) {

    const stopKey =
        `${event.part}-${event.tick}-${event.slideStopNumber}`;

    if (glissandoStopsHandled.has(stopKey)) {
        continue;
    }
}

// ------------------------------------------------
// GLISSANDO – původní chromatické přehrávání po tónech
// ------------------------------------------------

if (
    event.glissandoStart &&
    event.midi !== null
) {

    const glissKey =
        `${event.part}-${event.voice}-${event.staff}-${event.tick}-${event.glissandoStartNumber}`;

    if (!scheduledGlissandos.has(glissKey)) {

        const endEvent =
            this.findGlissandoEnd(event);

        if (
            endEvent &&
            endEvent.midi !== null &&
            endEvent.tick > event.tick
        ) {

            scheduledGlissandos.add(glissKey);

            const endKey =
                `${endEvent.part}-${endEvent.tick}-${endEvent.glissandoStopNumber}`;

            glissandoStopsHandled.add(endKey);

            this.scheduleGlissando(
                event,
                endEvent,
                noteOnTime
            );

            const glissEndTime =
                this.getTimeAtTick(endEvent.tick) -
                this.getTimeAtTick(startTick);

            const targetEndTime =
                this.getTimeAtTick(
                    this.findTieEndTick(endEvent)
                ) -
                this.getTimeAtTick(startTick);

            endTime =
                Math.max(
                    endTime,
                    targetEndTime,
                    glissEndTime
                );

            continue;
        }
    }
}

if (event.glissandoStop) {

    const stopKey =
        `${event.part}-${event.tick}-${event.glissandoStopNumber}`;

    if (glissandoStopsHandled.has(stopKey)) {
        continue;
    }
}

// ------------------------------------------------
// ARPEGGIO
// ------------------------------------------------

if (
    event.arpeggio &&
    event.midi !== null
) {

    const groupKey =
        `${event.part}-${event.voice}-${event.staff}-${event.tick}-${occurrence.offset}`;

    if (!scheduledArpeggios.has(groupKey)) {

        scheduledArpeggios.add(groupKey);

        const group =
            this.events.filter(other =>
                !other.rest &&
                other.part === event.part &&
                other.voice === event.voice &&
                other.staff === event.staff &&
                other.tick === event.tick &&
                other.arpeggio
            );

        if (group.length > 1) {

            const arpeggioFermata =
                group.some(note => note.fermata === true);

            this.scheduleArpeggio(
                group,
                noteOnTime,
                arpeggioFermata ? 1.5 : 1.0
            );

            const arpeggioStep = 30;

            endTime =
                Math.max(
                    endTime,
                    noteOnTime +
                    noteDurationTime +
                    (group.length - 1) * arpeggioStep
                );

            continue;

        }

    } else {

        continue;

    }

}
    
 /*   console.log(
    "ARTIKULACE TEST:",
    "takt:", event.measure,
    "tick:", event.tick,
    "midi:", event.midi,
    "duration:", event.duration,
    "part:", event.part,
    "voice:", event.voice,
    "staff:", event.staff,
    "art:", event.articulations,
    "endTick:", endTick
);*/

const noteOffTime =
    noteOnTime +
    noteDurationTime * articulationLength +
    getFermataDelayBeforeTick(
        occurrence.segmentStart,
        endTick
    ) -
    getFermataDelayBeforeTick(
        occurrence.segmentStart,
        event.tick
    );

/*console.log(
    "NOTE OFF:",
    "takt:", event.measure,
    "midi:", event.midi,
    "art:", event.articulations,
    "původní délka ms:", noteDurationTime,
    "artikulovaná délka ms:",
    noteDurationTime * articulationLength
);*/


    endTime =
        Math.max(endTime, noteOffTime);

      // ------------------------------------------------
// TRYLEK
// ------------------------------------------------

if (
    (
        event.trillMark ||
        event.trillWavyStart
    ) &&
    event.midi !== null
) {

    this.scheduleTrill(
        event,
        noteOnTime,
        noteDurationTime
    );

    endTime =
        Math.max(
            endTime,
            noteOnTime + noteDurationTime
        );

    continue;
}
    // ------------------------------------------------
    // NOTE ON
    // ------------------------------------------------

    this.addNoteOnTimer(

        setTimeout(() => {

            if (!this.isPlaying)
                return;


            if (event.tick !== this.currentTick) {

                this.currentTick = event.tick;

                if (this.onTickChanged) {

                    this.onTickChanged(event.tick);

                }

            }


            this.player.noteOn(event);


            if (this.onNote) {

                this.onNote(event);

            }

        }, noteOnTime)

    );


    // ------------------------------------------------
    // NOTE OFF
    // ------------------------------------------------

    this.addNoteOffTimer(

        setTimeout(() => {

            if (!this.isPlaying)
                return;

            this.player.noteOff(event);

        }, noteOffTime)

    );

}

    this.finishTimer = setTimeout(() => {

    if (!this.isPlaying)
        return;

    if (this.loopStart !== null && this.loopEnd !== null) {

        console.log(
            "LOOP: konec rozsahu, návrat na takt",
            this.loopStart
        );

        // Při Loop se musíme vrátit na skutečný začátek smyčky,
        // nikoliv na začátek celé skladby.
        const loopStartEvent = this.events.find(
            event => event.measure === this.loopStart
        );

        const loopStartTick = loopStartEvent
            ? loopStartEvent.tick
            : 0;

        console.log(
            "LOOP: návrat na začátek smyčky, takt",
            this.loopStart,
            "tick",
            loopStartTick
        );

        this.scheduleEvents(loopStartTick);

        return;
    }

    this.isPlaying = false;

    if (this.onFinished) {

        this.onFinished();

    }

}, endTime + 20);

} 

    stop() {

    this.isPlaying = false;
    this.isPaused = false;

    this.clearScheduledEvents();

    if (this.player && this.player.stopAll) {
        this.player.stopAll();
    }

    this.currentMeasure = -1;

}
    
    clearScheduledEvents() {

    for (const id of this.noteOnTimers) {
        clearTimeout(id);
    }

    for (const id of this.noteOffTimers) {
        clearTimeout(id);
    }

    this.noteOnTimers.length = 0;
    this.noteOffTimers.length = 0;

    for (const id of this.pedalTimers) {
        clearTimeout(id);
    }

    this.pedalTimers.length = 0;

    if (this.finishTimer) {
        clearTimeout(this.finishTimer);
        this.finishTimer = null;
    }

}
    
    
     pause() {

    if (!this.isPlaying)
        return;

    this.resumeMeasure = Math.max(0, this.currentMeasure);

    this.isPlaying = false;
    this.isPaused = true;

    this.clearScheduledEvents();

    // Pause musí okamžitě umlčet právě znějící tóny.
    // Samotné zrušení timeoutů zastaví jen budoucí události.
    if (this.player && this.player.stopAll) {
        this.player.stopAll();
    }

}

resume() {

    if (this.isPlaying)
        return;

    const tick = this.findTickForMeasure(this.resumeMeasure);

    console.log(
        "RESUME od taktu",
        this.resumeMeasure,
        "(tick",
        tick + ")"
    );

    this.isPlaying = true;
    this.isPaused = false;

    this.scheduleEvents(tick);

}
    
    

    buildMeasureOccurrences(startTick = 0, loopEndTick = null) {

        const occurrences = [];
        let wallOffset = 0;

        for (const segment of this.buildPlaybackSegments(
            startTick,
            loopEndTick
        )) {

            for (let pass = 0; pass < segment.repetitions; pass++) {

                const intervals =
                    this.getSegmentPassIntervals(segment, pass);

                let passOffset = wallOffset;

                for (const interval of intervals) {

                    const intervalDuration =
                        this.getTimeAtTick(interval.endTick) -
                        this.getTimeAtTick(interval.startTick);

                    for (const event of this.measureEvents || []) {

                        if (
                            event.tick < interval.startTick ||
                            event.tick >= interval.endTick
                        ) {
                            continue;
                        }

                        occurrences.push({
                            event,
                            segmentStart: interval.startTick,
                            offset: passOffset
                        });

                    }

                    passOffset += intervalDuration;
                }

                wallOffset = passOffset;
            }
        }

        return occurrences;
    }

    buildPlaybackSegments(startTick = 0, loopEndTick = null) {

        /*
         * D.S. al Fine:
         * 1) přehrajeme skladbu až k D.S.,
         * 2) skočíme na Segno,
         * 3) přehrajeme až k Fine a tam skončíme.
         *
         * Uživatelský Loop má přednost, protože jde o ručně zadaný
         * rozsah přehrávání.
         */
        const nav = this.navigation;

        // D.C. al Fine: první průchod až k D.C., potom od začátku
        // skladby znovu až k Fine.
        if (
            loopEndTick === null &&
            nav &&
            nav.type === "D.C. al Fine" &&
            Number.isFinite(nav.fineEndTick) &&
            Number.isFinite(nav.dacapoTick) &&
            startTick < nav.dacapoTick
        ) {

            const firstEndTick = Math.max(startTick, nav.dacapoEndTick);

            const firstSegments =
                this.buildRepeatPlaybackSegments(startTick, firstEndTick);

            const secondSegments =
                this.buildRepeatPlaybackSegments(0, nav.fineEndTick);

            console.log(
                "D.C. al Fine – playback:",
                "od", startTick,
                "do D.C.", nav.dacapoMeasure,
                "→ začátek → Fine", nav.fineMeasure
            );

            return [
                ...firstSegments,
                ...secondSegments
            ];
        }

        if (
            loopEndTick === null &&
            nav &&
            nav.type === "D.S. al Fine" &&
            Number.isFinite(nav.segnoTick) &&
            Number.isFinite(nav.fineEndTick) &&
            Number.isFinite(nav.dalsegnoTick) &&
            Number.isFinite(nav.dalsegnoEndTick) &&
            startTick < nav.dalsegnoTick
        ) {

            const firstEndTick =
                Math.max(
                    startTick,
                    nav.dalsegnoEndTick
                );

            const firstSegments =
                this.buildRepeatPlaybackSegments(
                    startTick,
                    firstEndTick
                );

            const secondSegments =
                this.buildRepeatPlaybackSegments(
                    nav.segnoTick,
                    nav.fineEndTick
                );

            console.log(
                "D.S. al Fine – playback:",
                "od", startTick,
                "do D.S.", nav.dalsegnoMeasure,
                "→ Segno", nav.segnoMeasure,
                "→ Fine", nav.fineMeasure
            );

            return [
                ...firstSegments,
                ...secondSegments
            ];
        }

        return this.buildRepeatPlaybackSegments(
            startTick,
            loopEndTick
        );
    }

    buildRepeatPlaybackSegments(startTick = 0, loopEndTick = null) {

        const totalEndTick = this.events.length
            ? Math.max(
                ...this.events.map(
                    e => e.tick + (e.duration || 0)
                )
            )
            : startTick;

        const hardEnd =
            loopEndTick !== null
                ? Math.min(loopEndTick, totalEndTick)
                : totalEndTick;

        /*
         * Repeat je relevantní i tehdy, když začneme přehrávat
         * uvnitř jeho rozsahu. Dříve jsme vyžadovali
         * repeat.startTick >= startTick, čímž se při startu
         * uvnitř opakování repeat úplně ztratil.
         */
        const repeats = (this.repeatSections || [])
            .filter(repeat =>
                repeat.endTick > startTick &&
                repeat.startTick < hardEnd &&
                repeat.endTick > repeat.startTick
            )
            .sort((a, b) =>
                a.startTick - b.startTick
            );

        const segments = [];
        let cursor = startTick;

        for (const repeat of repeats) {

            /*
             * Překrývající se repeat bloky zatím nepřepisujeme.
             * Vybereme další repeat, který začíná za aktuálním
             * kurzorem, nebo repeat obsahující počáteční pozici.
             */
            if (repeat.endTick <= cursor) {
                continue;
            }

            if (repeat.startTick > cursor) {

                segments.push({
                    startTick: cursor,
                    endTick: Math.min(
                        repeat.startTick,
                        hardEnd
                    ),
                    repetitions: 1,
                    endings: []
                });

            }

            const segmentStart =
                repeat.startTick;

            const segmentEnd =
                Math.min(
                    repeat.endTick,
                    hardEnd
                );

            if (segmentEnd <= segmentStart) {
                continue;
            }

            segments.push({
                startTick: segmentStart,
                endTick: segmentEnd,
                /*
                 * Pokud začínáme uvnitř tohoto repeatu, první
                 * průchod začne až od playbackStartTick.
                 * Další průchod se ale vrací na skutečný |:.
                 */
                initialStartTick:
                    startTick > segmentStart
                        ? startTick
                        : segmentStart,
                repetitions:
                    Math.max(
                        2,
                        repeat.times || 2
                    ),
                endings:
                    (repeat.endings || []).map(
                        ending => ({ ...ending })
                    )
            });

            cursor = segmentEnd;
        }

        if (cursor < hardEnd) {

            segments.push({
                startTick: cursor,
                endTick: hardEnd,
                initialStartTick: cursor,
                repetitions: 1,
                endings: []
            });

        }

        if (!segments.length && hardEnd > startTick) {

            segments.push({
                startTick,
                endTick: hardEnd,
                initialStartTick: startTick,
                repetitions: 1,
                endings: []
            });

        }

        return segments;
    }

    getSegmentPassIntervals(segment, pass) {

        const firstPassStart =
            segment.initialStartTick ??
            segment.startTick;

        // Běžné opakování: celý úsek při každém průchodu.
        // Při startu uvnitř repeatu je první průchod zkrácen,
        // další průchody se vrací na skutečný začátek repeatu.
        if (!segment.endings || !segment.endings.length) {
            return [{
                startTick:
                    pass === 0
                        ? firstPassStart
                        : segment.startTick,
                endTick: segment.endTick
            }];
        }

        const firstEnding = segment.endings.find(e => e.number === 1);
        const secondEnding = segment.endings.find(e => e.number === 2);

        // 1. průchod: zahrajeme 1. zakončení, 2. vynecháme.
        if (pass === 0 && firstEnding) {
            return [{
                startTick:
                    Math.max(
                        segment.startTick,
                        firstPassStart
                    ),
                endTick: firstEnding.endTick
            }];
        }

        // Další průchody: znovu zahrajeme hlavní část od |:
        // a přeskočíme celé 1. zakončení. Potom zahrajeme 2. zakončení.
        //
        // Příklad: 97 ... 115-116 (1.) :| 117-118 (2.)
        // 1. průchod: 97 -> 116
        // 2. průchod: 97 -> 115 + 117 -> 118
        if (pass > 0 && firstEnding && secondEnding) {
            return [
                {
                    startTick: segment.startTick,
                    endTick: firstEnding.startTick
                },
                {
                    startTick: secondEnding.startTick,
                    endTick: segment.endTick
                }
            ];
        }

        return [{
            startTick: segment.startTick,
            endTick: segment.endTick
        }];
    }

    getIntervalsDuration(intervals) {

        return intervals.reduce((sum, interval) =>
            sum + (
                this.getTimeAtTick(interval.endTick) -
                this.getTimeAtTick(interval.startTick)
            ),
            0
        );
    }

    buildPlaybackOccurrences(startTick = 0, loopEndTick = null) {

        const occurrences = [];
        let wallOffset = 0;

        for (const segment of this.buildPlaybackSegments(startTick, loopEndTick)) {

            for (let pass = 0; pass < segment.repetitions; pass++) {

                const intervals =
                    this.getSegmentPassIntervals(segment, pass);

                let passOffset = wallOffset;

                for (const interval of intervals) {

                    const intervalDuration =
                        this.getTimeAtTick(interval.endTick) -
                        this.getTimeAtTick(interval.startTick);

                    for (const event of this.events) {

                        if (event.tick < interval.startTick ||
                            event.tick >= interval.endTick) {
                            continue;
                        }

                        occurrences.push({
                            event,
                            segmentStart: interval.startTick,
                            offset: passOffset
                        });
                    }

                    passOffset += intervalDuration;
                }

                wallOffset = passOffset;
            }
        }

        return occurrences;
    }

    getPedalOccurrences(startTick = 0, loopEndTick = null) {

        const occurrences = [];
        let wallOffset = 0;

        for (const segment of this.buildPlaybackSegments(startTick, loopEndTick)) {

            for (let pass = 0; pass < segment.repetitions; pass++) {

                const intervals =
                    this.getSegmentPassIntervals(segment, pass);

                let passOffset = wallOffset;

                for (const interval of intervals) {

                    const intervalDuration =
                        this.getTimeAtTick(interval.endTick) -
                        this.getTimeAtTick(interval.startTick);

                    for (const event of this.pedalEvents || []) {

                        if (event.tick < interval.startTick ||
                            event.tick >= interval.endTick) {
                            continue;
                        }

                        occurrences.push({
                            event,
                            segmentStart: interval.startTick,
                            offset: passOffset
                        });
                    }

                    passOffset += intervalDuration;
                }

                wallOffset = passOffset;
            }
        }

        return occurrences;
    }

    applyPedal(event) {

        /*
         * SoundFontPlayer může mít vlastní metodu pedal().
         * To je preferovaná cesta, protože si sám určí správný
         * MIDI kanál podle partu.
         *
         * Fallback používá přímo SpessaSynth controllerChange().
         */
        if (this.player && typeof this.player.pedal === "function") {

            this.player.pedal(event);
            return;

        }

        const instrument =
            this.player?.instruments?.get?.(event.part);

        const channel =
            instrument
                ? instrument.channel
                : this.player?.channel;

        if (
            channel === undefined ||
            channel === null ||
            !this.player?.synth ||
            typeof this.player.synth.controllerChange !== "function"
        ) {
            console.warn(
                "PEDÁL: SoundFontPlayer nemá metodu pedal() " +
                "ani dostupný controllerChange."
            );
            return;
        }

        if (event.action === "start") {

            this.player.synth.controllerChange(
                channel,
                64,
                127
            );

        } else if (event.action === "stop") {

            this.player.synth.controllerChange(
                channel,
                64,
                0
            );

        } else if (event.action === "change") {

            // Re-pedal: krátce uvolnit a okamžitě znovu sešlápnout.
            this.player.synth.controllerChange(
                channel,
                64,
                0
            );

            this.player.synth.controllerChange(
                channel,
                64,
                127
            );

        }

    }

    addNoteOnTimer(id) {

    this.noteOnTimers.push(id);

}

addNoteOffTimer(id) {

    this.noteOffTimers.push(id);

}

findTieEndTick(event) {

    if (!event.tieStart) {
        return event.tick + event.duration;
    }

    let current = event;

    while (true) {

        const next = this.events.find(other =>

            other !== current &&

            !other.rest &&

            other.part === current.part &&

            other.voice === current.voice &&

            other.staff === current.staff &&

            other.midi === current.midi &&

            other.tick === current.tick + current.duration &&

            other.tieStop

        );

        // Nenalezena další nota v Tie
        if (!next) {
            break;
        }

        current = next;

        // Pokud tato nota zároveň STARTUJE další Tie,
        // řetěz pokračuje dál.
        if (current.tieStart) {
            continue;
        }

        // Má STOP, ale už nemá START.
        // Tady Tie skutečně končí.
        return current.tick + current.duration;
    }

    return event.tick + event.duration;
}

    getDivisions() {

        if (!this.events.length)
            return 1;

        return this.events[0].divisions || 1;

    }

       setFinishedCallback(callback) {

         this.onFinished = callback;

         }

         setNoteCallback(callback) {

              this.onNote = callback;

          }
          
     setMeasureChangedCallback(callback) {
    this.onMeasureChanged = callback;
}  


  getTimeAtTick(tick) {
  


    const divisions = this.getDivisions();

let lastTick = 0;
let currentTempo = this.bpm;
let time = 0;

// Poměr uživatelského tempa vůči základnímu tempu skladby
const baseTempo =
    this.tempoEvents && this.tempoEvents.length
        ? this.tempoEvents[0].tempo
        : this.bpm;

const tempoMultiplier = this.bpm / baseTempo;
    

    if (!this.tempoEvents || this.tempoEvents.length === 0) {

        return tick * ((60000 / currentTempo) / divisions);

    }

    for (const tempoEvent of this.tempoEvents) {

        if (tempoEvent.tick > tick)
            break;

        time += (tempoEvent.tick - lastTick) *
                ((60000 / currentTempo) / divisions);

        currentTempo = tempoEvent.tempo * tempoMultiplier;
        lastTick = tempoEvent.tick;

    }

    time += (tick - lastTick) *
            ((60000 / currentTempo) / divisions);

    return time;

}


findTickForMeasure(measure) {

    for (const event of this.events) {

        if (event.measure === measure) {
            return event.tick;
        }

    }

    return 0;

}

getChordArticulations(event) {

    const articulations = [
        ...(event.articulations || [])
    ];

    const chordEvents = this.events.filter(other =>
        other !== event &&
        !other.rest &&
        other.part === event.part &&
        other.voice === event.voice &&
        other.staff === event.staff &&
        other.tick === event.tick
    );

    for (const other of chordEvents) {

        for (const articulation of (other.articulations || [])) {

            if (!articulations.includes(articulation)) {

                articulations.push(articulation);

            }

        }

    }

    return articulations;

}
findGlissandoEnd(event) {

    // Glissando se páruje podle stejného partu a čísla glissanda.
    // Důležité je vybrat NEJBLIŽŠÍ následující stop podle ticku.
    //
    // Nelze nejdřív preferovat stejný staff/voice, protože například
    // takt 14 -> 15 začíná na staff 2 (A3), ale končí na staff 1 (C5).
    // Kdybychom preferovali stejný staff, vybrali bychom až pozdější
    // C3 a glissando by šlo špatným směrem přes další takty.

    const candidates = this.events.filter(other =>
        other !== event &&
        !other.rest &&
        other.part === event.part &&
        other.glissandoStop &&
        other.glissandoStopNumber === event.glissandoStartNumber &&
        other.tick > event.tick &&
        other.midi !== null
    );

    if (candidates.length > 0) {
        return candidates.reduce((nearest, other) =>
            !nearest || other.tick < nearest.tick
                ? other
                : nearest,
            null
        );
    }

    // Některé MusicXML soubory používají současně dvě navazující
    // glissanda a první z nich nemá vlastní <glissando stop>.
    // Takt 16 je přesně tento případ:
    // C3 (start 2) -> C5 (start 1) -> C3 (stop 1).
    // V takovém případě je nejbližší další glissando START
    // hranicí prvního glissanda.
    const nextStart = this.events
        .filter(other =>
            other !== event &&
            !other.rest &&
            other.part === event.part &&
            other.glissandoStart &&
            other.tick > event.tick &&
            other.midi !== null
        )
        .reduce((nearest, other) =>
            !nearest || other.tick < nearest.tick
                ? other
                : nearest,
            null
        );

    if (nextStart) {
        return {
            ...nextStart,
            _glissandoBoundaryOnly: true
        };
    }

    return null;

}

findSlideEnd(event) {

    const sameLine = this.events.find(other =>
        other !== event &&
        !other.rest &&
        other.part === event.part &&
        other.voice === event.voice &&
        other.staff === event.staff &&
        other.slideStop &&
        other.slideStopNumber === event.slideStartNumber &&
        other.tick > event.tick
    );

    if (sameLine) {
        return sameLine;
    }

    return this.events.find(other =>
        other !== event &&
        !other.rest &&
        other.part === event.part &&
        other.slideStop &&
        other.slideStopNumber === event.slideStartNumber &&
        other.tick > event.tick
    ) || null;

}

scheduleSlide(startEvent, endEvent, noteOnTime) {

    const startMidi = startEvent.midi;
    const endMidi = endEvent.midi;
    const distance = endMidi - startMidi;

    if (distance === 0) {
        return;
    }

    const glissDuration =
        this.getTimeAtTick(endEvent.tick) -
        this.getTimeAtTick(startEvent.tick);

    if (glissDuration <= 0) {
        return;
    }

    const instrument =
        this.player.instruments?.get(startEvent.part);

    const channel =
        instrument ? instrument.channel : this.player.channel;

    const bendRange = Math.max(2, Math.abs(distance));
    const pitchCenter = 8192;
    const stepMs = 10;
    const steps = Math.max(2, Math.ceil(glissDuration / stepMs));

    this.addNoteOnTimer(
        setTimeout(() => {
            if (!this.isPlaying) return;

            if (this.player.synth?.pitchWheelRange) {
                this.player.synth.pitchWheelRange(channel, bendRange);
            }

            if (this.player.synth?.pitchWheel) {
                this.player.synth.pitchWheel(channel, pitchCenter);
            }

            this.player.noteOn(startEvent);

            if (this.onNote) {
                this.onNote(startEvent);
            }
        }, noteOnTime)
    );

    for (let i = 1; i <= steps; i++) {

        const progress = i / steps;
        const bendSemitones = distance * progress;

        const bendValue = Math.max(
            0,
            Math.min(
                16383,
                Math.round(
                    pitchCenter +
                    (bendSemitones / bendRange) * pitchCenter
                )
            )
        );

        const onTime =
            noteOnTime +
            glissDuration * progress;

        this.addNoteOnTimer(
            setTimeout(() => {
                if (!this.isPlaying) return;

                if (this.player.synth?.pitchWheel) {
                    this.player.synth.pitchWheel(
                        channel,
                        bendValue
                    );
                }
            }, onTime)
        );
    }

    const targetEndTime =
        this.getTimeAtTick(
            this.findTieEndTick(endEvent)
        ) -
        this.getTimeAtTick(startEvent.tick);

    this.addNoteOffTimer(
        setTimeout(() => {
            if (!this.isPlaying) return;

            this.player.noteOff(startEvent);

            if (this.player.synth?.pitchWheel) {
                this.player.synth.pitchWheel(
                    channel,
                    pitchCenter
                );
            }
        }, noteOnTime + targetEndTime)
    );
}

scheduleGlissando(startEvent, endEvent, noteOnTime) {

    const startMidi = startEvent.midi;
    const endMidi = endEvent.midi;
    const distance = endMidi - startMidi;
    const steps = Math.abs(distance);

    if (steps === 0) {
        return;
    }

    const glissDuration =
        this.getTimeAtTick(endEvent.tick) -
        this.getTimeAtTick(startEvent.tick);

    const stepTime = glissDuration / steps;
    const direction = distance > 0 ? 1 : -1;

    // Pokud je cílem pouze hranice navazujícího glissanda
    // (např. C3 -> C5 | C5 -> C3), první C5 musí skončit
    // přesně na této hranici. Druhé C5 se potom spustí
    // jako samostatná nota druhého glissanda.
    const targetEndTime = endEvent._glissandoBoundaryOnly
        ? glissDuration
        : this.getTimeAtTick(
            this.findTieEndTick(endEvent)
          ) -
          this.getTimeAtTick(startEvent.tick);

    for (let i = 0; i <= steps; i++) {

        const midi =
            startMidi + direction * i;

        const onTime =
            noteOnTime + i * stepTime;

        const glissEvent = {
            ...startEvent,
            midi: midi
        };

        const isTarget = i === steps;

        const offTime = isTarget
            ? noteOnTime + targetEndTime
            : noteOnTime + Math.min((i + 1) * stepTime, glissDuration) + 5;

        this.addNoteOnTimer(
            setTimeout(() => {
                if (!this.isPlaying) return;

                this.player.noteOn(glissEvent);

                if (this.onNote) {
                    this.onNote(glissEvent);
                }
            }, onTime)
        );

        this.addNoteOffTimer(
            setTimeout(() => {
                if (!this.isPlaying) return;

                this.player.noteOff(glissEvent);
            }, offTime)
        );
    }

}

scheduleTrill(event, noteOnTime, noteDurationTime) {

    // rychlost trylku v ms na jeden tón
    const stepTime = 75;

    // počet tónů podle délky noty
    const trillSteps = Math.max(
        2,
        Math.floor(noteDurationTime / stepTime)
    );

    const upperMidi =
        event.midi + 2;

    for (let i = 0; i < trillSteps; i++) {

        const midi =
            i % 2 === 0
                ? event.midi
                : upperMidi;

        const trillEvent = {
            ...event,
            midi: midi
        };

        const onTime =
            noteOnTime + i * stepTime;

        const offTime =
            onTime + stepTime * 0.85;

        this.addNoteOnTimer(

            setTimeout(() => {

                if (!this.isPlaying)
                    return;

                this.player.noteOn(trillEvent);

            }, onTime)

        );

        this.addNoteOffTimer(

            setTimeout(() => {

                if (!this.isPlaying)
                    return;

                this.player.noteOff(trillEvent);

            }, offTime)

        );

    }

}

scheduleArpeggio(group, noteOnTime, durationMultiplier = 1.0) {

    if (!group || group.length < 2) {
        return;
    }

    // ---------------------------------------------------------
    // Směr arpeggia
    // ---------------------------------------------------------

    const direction =
        group[0].arpeggioDirection || "up";

    const notes =
        [...group].sort((a, b) =>
            a.midi - b.midi
        );

    if (direction === "down") {
        notes.reverse();
    }


    // ---------------------------------------------------------
    // Čas mezi jednotlivými tóny u arpeggia
    // ---------------------------------------------------------

    const baseTempo = 120;

const stepTime =
    40 * (baseTempo / this.bpm);

    // ---------------------------------------------------------
    // Postupné spuštění tónů
    // ---------------------------------------------------------

    notes.forEach((note, index) => {

        const onTime =
            noteOnTime +
            index * stepTime;

        const durationTime =
            this.getTimeAtTick(
                note.tick + note.duration
            ) -
            this.getTimeAtTick(
                note.tick
            );

        const offTime =
            onTime +
            durationTime * durationMultiplier;


        // NOTE ON

        this.addNoteOnTimer(

            setTimeout(() => {

                if (!this.isPlaying)
                    return;

                this.player.noteOn(note);

                if (this.onNote) {
                    this.onNote(note);
                }

            }, onTime)

        );


        // NOTE OFF

        this.addNoteOffTimer(

            setTimeout(() => {

                if (!this.isPlaying)
                    return;

                this.player.noteOff(note);

            }, offTime)

        );

    });

}

}
