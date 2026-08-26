export default class MusicXMLParser {

    static parse(xml) {

        const parser = new MusicXMLParser(xml);

        return parser.parse();

    }

    constructor(xml) {

        this.xml = xml;

        this.events = [];
        
       this.measureEvents = [];
       this.measureStarts = []; 
        
        this.tempoEvents = [];
        this.dynamicEvents = [];
        this.pedalEvents = [];
        this.repeatSections = [];
        this.navigation = null;
        this._openRepeatStartTick = null;
        this._openRepeatStartMeasure = null;
        this._pendingRepeatEnd = null;
        this.instruments = [];

        this.divisions = 1;

        this.currentTick = 0;

        this.currentMeasure = 0;

        this.currentPart = 0;
        
        this.tempo = 120;
        

    }

   parse() {

    console.log("Parser 17.3 spuštěn");

    console.log(this.xml);

    const sound = this.xml.querySelector("sound[tempo]");

    if (sound) {

        const tempo = parseFloat(sound.getAttribute("tempo"));

        if (!isNaN(tempo)) {

            this.tempo = tempo;

           // console.log("Tempo z MusicXML:", this.tempo);

        }

    }

    const score = this.xml.documentElement;

        if (!score || score.nodeName !== "score-partwise") {

            throw new Error("Podporován je pouze score-partwise.");

        }
        
        this.parseInstruments(score);

        const parts = score.querySelectorAll(":scope > part");

        for (let i = 0; i < parts.length; i++) {

            this.currentPart = i + 1;

            this.parsePart(parts[i]);

        }

        // Druhé zpracování opakování podle skutečné struktury MusicXML.
        // Zde doplníme i 1./2. zakončení (volta).
        this.buildRepeatSectionsFromXML(parts[0]);

        // Navigační značky Segno / D.S. al Fine / Fine.
        // V předchozí verzi byla funkce připravená, ale nebyla zavolána.
        this.buildNavigationFromXML(parts[0]);
        
 const debugEvents = [...this.events].sort((a, b) => a.tick - b.tick);

/*console.table(
    debugEvents.slice(0, 50).map(e => ({
        part: e.part,
        measure: e.measure,
        tick: e.tick,
        voice: e.voice,
        staff: e.staff,
        rest: e.rest,
        midi: e.midi
    }))
);
*/
 

     return {
    events: this.events,
    measureEvents: this.measureEvents,
    measureStarts: this.measureStarts,
    tempo: this.tempo,
    tempoEvents: this.tempoEvents,
    dynamicEvents: this.dynamicEvents,
    pedalEvents: this.pedalEvents,
    repeatSections: this.repeatSections,
    navigation: this.navigation,
    instruments: this.instruments
    };

    }
    parseInstruments(score) {

    this.instruments = [];

    const scoreParts =
        score.querySelectorAll(":scope > part-list > score-part");

    for (let i = 0; i < scoreParts.length; i++) {

        const scorePart = scoreParts[i];

        const id =
            scorePart.getAttribute("id");

        const nameNode =
            scorePart.querySelector(":scope > part-name");

        const instrumentNode =
            scorePart.querySelector(":scope > score-instrument");

        const midiNode =
            scorePart.querySelector(":scope > midi-instrument");


        const name =
            nameNode
                ? nameNode.textContent.trim()
                : "";


        const instrumentNameNode =
            instrumentNode
                ? instrumentNode.querySelector(":scope > instrument-name")
                : null;

        const instrumentName =
            instrumentNameNode
                ? instrumentNameNode.textContent.trim()
                : name;


        const channelNode =
            midiNode
                ? midiNode.querySelector(":scope > midi-channel")
                : null;

        const programNode =
            midiNode
                ? midiNode.querySelector(":scope > midi-program")
                : null;


        const channel =
            channelNode
                ? parseInt(channelNode.textContent)
                : 1;

        const program =
            programNode
                ? parseInt(programNode.textContent)
                : 1;


        const instrument = {

            part: i + 1,

            id: id,

            name: name,

            instrumentName: instrumentName,

            channel: channel,

            program: program

        };


        this.instruments.push(instrument);


      /*  console.log(
            "NÁSTROJ:",
            instrument
        );*/

    }

}

    buildRepeatSectionsFromXML(part) {

        if (!part) {
            this.repeatSections = [];
            return;
        }

        const measures = [...part.querySelectorAll(":scope > measure")];

        const measureMap = new Map();

        for (const item of this.measureEvents) {
            measureMap.set(item.measure, item.tick);
        }

        const getMeasureEndTick = (measureNumber) => {

            const index = measures.findIndex(m =>
                parseInt(m.getAttribute("number") || "0") === measureNumber
            );

            if (index < 0)
                return null;

            const next = measures[index + 1];

            if (next) {
                const nextNumber =
                    parseInt(next.getAttribute("number") || "0");

                const nextTick = measureMap.get(nextNumber);

                if (nextTick !== undefined)
                    return nextTick;
            }

            const eventsInMeasure = this.events.filter(event =>
                event.measure === measureNumber
            );

            if (!eventsInMeasure.length)
                return measureMap.get(measureNumber) ?? null;

            return Math.max(...eventsInMeasure.map(event =>
                event.tick + (event.duration || 0)
            ));
        };

        const endings = [];
        let activeEndings = new Map();

        for (const measure of measures) {

            const number =
                parseInt(measure.getAttribute("number") || "0");

            const barlines = measure.querySelectorAll(":scope > barline");

            for (const barline of barlines) {

                const endingNodes =
                    barline.querySelectorAll(":scope > ending");

                for (const ending of endingNodes) {

                    const type = ending.getAttribute("type");
                    const numberText =
                        ending.getAttribute("number") || "";

                    const numbers = numberText
                        .split(/[ ,]+/)
                        .map(value => parseInt(value, 10))
                        .filter(Number.isFinite);

                    for (const endingNumber of numbers) {

                        if (type === "start") {

                            activeEndings.set(endingNumber, {
                                number: endingNumber,
                                startMeasure: number
                            });
                        }

                        /*
                         * MuseScore používá pro konec volty podle situace
                         * nejen type="stop", ale také type="discontinue".
                         *
                         * Oba významy jsou pro přehrávání stejné:
                         * tímto místem dané zakončení končí.
                         */
                        if (
                            type === "stop" ||
                            type === "discontinue"
                        ) {

                            const active =
                                activeEndings.get(endingNumber);

                            if (active) {

                                const endMeasure = number;

                                endings.push({
                                    number: endingNumber,
                                    startMeasure: active.startMeasure,
                                    endMeasure,
                                    startTick:
                                        measureMap.get(
                                            active.startMeasure
                                        ),
                                    endTick:
                                        getMeasureEndTick(
                                            endMeasure
                                        )
                                });

                                activeEndings.delete(
                                    endingNumber
                                );
                            }
                        }
                    }
                }
            }
        }

        const repeatStarts = [];
        const rawRepeats = [];

        for (const measure of measures) {

            const number =
                parseInt(measure.getAttribute("number") || "0");

            const repeatNodes =
                measure.querySelectorAll(":scope > barline > repeat");

            for (const repeatNode of repeatNodes) {

                const direction =
                    repeatNode.getAttribute("direction");

                if (direction === "forward") {

                    repeatStarts.push({
                        startMeasure: number,
                        startTick: measureMap.get(number)
                    });
                }

                if (direction === "backward") {

                    const start = repeatStarts.length
                        ? repeatStarts[repeatStarts.length - 1]
                        : null;

                    if (!start || start.startTick === undefined)
                        continue;

                    let times = parseInt(
                        repeatNode.getAttribute("times") || "2",
                        10
                    );

                    if (!Number.isFinite(times) || times < 2)
                        times = 2;

                    rawRepeats.push({
                        startTick: start.startTick,
                        startMeasure: start.startMeasure,
                        repeatMeasure: number,
                        repeatEndTick: getMeasureEndTick(number),
                        times
                    });

                    repeatStarts.pop();
                }
            }
        }

        this.repeatSections = rawRepeats.map(repeat => {

            // Najdeme 1. zakončení, které končí na opakovací čáře.
            const firstEnding = endings.find(ending =>
                ending.number === 1 &&
                ending.endMeasure === repeat.repeatMeasure
            );

            // A následné 2. zakončení, které začíná za opakovací čárou.
            const secondEnding = endings.find(ending =>
                ending.number === 2 &&
                ending.startMeasure > repeat.repeatMeasure
            );

            const hasVolta = !!firstEnding && !!secondEnding;

            const endTick = hasVolta
                ? secondEnding.endTick
                : repeat.repeatEndTick;

            const section = {
                startTick: repeat.startTick,
                endTick,
                startMeasure: repeat.startMeasure,
                endMeasure: hasVolta
                    ? secondEnding.endMeasure
                    : repeat.repeatMeasure,
                times: repeat.times
            };

            if (hasVolta) {

                section.endings = [
                    {
                        number: 1,
                        startTick: firstEnding.startTick,
                        endTick: firstEnding.endTick
                    },
                    {
                        number: 2,
                        startTick: secondEnding.startTick,
                        endTick: secondEnding.endTick
                    }
                ];

                console.log(
                    "OPAKOVÁNÍ S VOLTOU:",
                    section.startMeasure,
                    "→",
                    section.endMeasure,
                    "times:",
                    section.times,
                    "1.",
                    firstEnding.startMeasure,
                    "→",
                    firstEnding.endMeasure,
                    "2.",
                    secondEnding.startMeasure,
                    "→",
                    secondEnding.endMeasure
                );
            }

            return section;
        });

        console.log(
            "REPEAT SECTIONS:",
            this.repeatSections
        );
    }

    buildNavigationFromXML(part) {

        if (!part) {
            this.navigation = null;
            return;
        }

        const measures = [...part.querySelectorAll(":scope > measure")];

        const measureMap = new Map();

        for (const item of this.measureEvents) {
            measureMap.set(item.measure, item.tick);
        }

        const getMeasureEndTick = (measureNumber) => {

            const index = measures.findIndex(measure =>
                parseInt(
                    measure.getAttribute("number") || "0",
                    10
                ) === measureNumber
            );

            if (index < 0) {
                return measureMap.get(measureNumber) ?? null;
            }

            const next = measures[index + 1];

            if (next) {

                const nextNumber = parseInt(
                    next.getAttribute("number") || "0",
                    10
                );

                const nextTick = measureMap.get(nextNumber);

                if (nextTick !== undefined) {
                    return nextTick;
                }
            }

            const eventsInMeasure = this.events.filter(event =>
                event.measure === measureNumber
            );

            if (!eventsInMeasure.length) {
                return measureMap.get(measureNumber) ?? null;
            }

            return Math.max(
                ...eventsInMeasure.map(event =>
                    event.tick + (event.duration || 0)
                )
            );
        };

        let segnoTick = null;
        let segnoMeasure = null;

        let fineTick = null;
        let fineMeasure = null;

        let dalsegnoTick = null;
        let dalsegnoMeasure = null;

        let dacapoTick = null;
        let dacapoMeasure = null;

        for (const measure of measures) {

            const number = parseInt(
                measure.getAttribute("number") || "0",
                10
            );

            const directions =
                measure.querySelectorAll(":scope > direction");

            for (const direction of directions) {

                const soundNode =
                    direction.querySelector(":scope > sound");

                const segnoNode =
                    direction.querySelector(":scope > direction-type > segno");

                const wordsNodes =
                    direction.querySelectorAll(":scope > direction-type > words");

                const words =
                    [...wordsNodes]
                        .map(node => node.textContent.trim())
                        .join(" ")
                        .toLowerCase();

                if (
                    segnoNode ||
                    (
                        soundNode &&
                        soundNode.hasAttribute("segno")
                    )
                ) {

                    if (segnoTick === null) {
                        segnoTick = measureMap.get(number);
                        segnoMeasure = number;
                    }
                }

                if (
                    (
                        soundNode &&
                        soundNode.getAttribute("fine") === "yes"
                    ) ||
                    /\bfine\b/i.test(words)
                ) {

                    if (fineTick === null) {
                        fineTick = measureMap.get(number);
                        fineMeasure = number;
                    }
                }

                if (
                    (
                        soundNode &&
                        soundNode.hasAttribute("dalsegno")
                    ) ||
                    /d\.?\s*s\.?\s*al\s+fine/i.test(words)
                ) {

                    if (dalsegnoTick === null) {
                        dalsegnoTick = measureMap.get(number);
                        dalsegnoMeasure = number;
                    }
                }

                if (
                    (soundNode && soundNode.hasAttribute("dacapo")) ||
                    /d\.?\s*c\.?\s*al\s+fine/i.test(words)
                ) {

                    if (dacapoTick === null) {
                        dacapoTick = measureMap.get(number);
                        dacapoMeasure = number;
                    }
                }
            }
        }

        // D.C. al Fine nepotřebuje Segno – návrat je na začátek skladby.
        if (dacapoTick !== null && fineTick !== null) {

            this.navigation = {
                type: "D.C. al Fine",
                fineTick,
                fineMeasure,
                fineEndTick: getMeasureEndTick(fineMeasure),
                dacapoTick,
                dacapoMeasure,
                dacapoEndTick: getMeasureEndTick(dacapoMeasure)
            };

            console.log(
                "NAVIGACE D.C. AL FINE:",
                "D.C. takt", dacapoMeasure,
                "Fine takt", fineMeasure
            );
            return;
        }

        if (
            segnoTick === null ||
            fineTick === null ||
            dalsegnoTick === null
        ) {

            this.navigation = null;
            return;
        }

        this.navigation = {
            type: "D.S. al Fine",
            segnoTick,
            segnoMeasure,
            fineTick,
            fineMeasure,
            fineEndTick: getMeasureEndTick(fineMeasure),
            dalsegnoTick,
            dalsegnoMeasure,
            dalsegnoEndTick: getMeasureEndTick(dalsegnoMeasure)
        };

        console.log(
            "NAVIGACE D.S. AL FINE:",
            "Segno takt", segnoMeasure,
            "D.S. takt", dalsegnoMeasure,
            "Fine takt", fineMeasure
        );
    }

    parsePart(part) {

        const measures = part.querySelectorAll(":scope > measure");

        this.currentTick = 0;

        for (let i = 0; i < measures.length; i++) {

    const measure = measures[i];

if (this.currentPart === 1) {

    this.measureStarts.push({
        tickStart: this.currentTick
    });

}

    this.currentMeasure = parseInt(
    measure.getAttribute("number") ?? i
);

    this.parseMeasure(measure);

}

    }

    parseMeasure(measure) {


     this.measureEvents.push({
        measure: this.currentMeasure,
        tick: this.currentTick
    });

        // ---------------------------------------------------------
        // OPAKOVÁNÍ MUSICXML
        // ---------------------------------------------------------
        if (this.currentPart === 1) {

            const repeatNodes =
                measure.querySelectorAll(":scope > barline > repeat");

            for (const repeatNode of repeatNodes) {

                const direction =
                    repeatNode.getAttribute("direction");

                if (direction === "forward") {

                    this._openRepeatStartTick = this.currentTick;
                    this._openRepeatStartMeasure = this.currentMeasure;

                    console.log(
                        "OPAKOVÁNÍ START:",
                        "takt", this.currentMeasure,
                        "tick", this.currentTick
                    );
                }

                if (
                    direction === "backward" &&
                    this._openRepeatStartTick !== null
                ) {

                    let times =
                        parseInt(
                            repeatNode.getAttribute("times") || "2"
                        );

                    if (!Number.isFinite(times) || times < 2) {
                        times = 2;
                    }

                    this._pendingRepeatEnd = {
                        startTick: this._openRepeatStartTick,
                        startMeasure: this._openRepeatStartMeasure,
                        endMeasure: this.currentMeasure,
                        times: times
                    };
                }
            }
        }

        const children = measure.children;
        /*console.log(
    "ZAČÁTEK TAKTU",
    this.currentMeasure,
    "tick:",
    this.currentTick
);*/

        for (const node of children) {

            switch (node.nodeName) {

                case "attributes":
                    this.parseAttributes(node);
                    break;
                case "direction":
                    this.parseDirection(node);
                    break;   

                case "note":
                    this.parseNote(node);
                    break;

                case "backup":
                    this.parseBackup(node);
                    break;

                case "forward":
                    this.parseForward(node);
                    break;

            }

        }

        if (
            this.currentPart === 1 &&
            this._pendingRepeatEnd
        ) {

            this.repeatSections.push({
                startTick: this._pendingRepeatEnd.startTick,
                endTick: this.currentTick,
                startMeasure: this._pendingRepeatEnd.startMeasure,
                endMeasure: this._pendingRepeatEnd.endMeasure,
                times: this._pendingRepeatEnd.times
            });

            console.log(
                "OPAKOVÁNÍ:",
                this._pendingRepeatEnd.startMeasure,
                "→",
                this._pendingRepeatEnd.endMeasure,
                "times:", this._pendingRepeatEnd.times
            );

            this._pendingRepeatEnd = null;
            this._openRepeatStartTick = null;
            this._openRepeatStartMeasure = null;
        }

    }

    parseAttributes(node) {

        const div = node.querySelector("divisions");

        if (div) {

            this.divisions = parseInt(div.textContent);

        }

    }
    
     parseDirection(node) {

    // ---------------------------------------------------------
    // TEMPO
    // ---------------------------------------------------------

    const soundTempo = node.querySelector("sound[tempo]");

    if (soundTempo) {

        const tempo = parseFloat(
            soundTempo.getAttribute("tempo")
        );

        if (!isNaN(tempo)) {

            this.tempoEvents.push({

                tick: this.currentTick,

                measure: this.currentMeasure,

                tempo: tempo

            });
           

        }

    }


    // ---------------------------------------------------------
    // KLAVÍRNÍ PEDÁL
    // <pedal type="start|stop|change"/>
    //
    // Pro přehrávání nás nezajímá grafická podoba značky
    // (line/sign), ale pouze stav pedálu.
    // ---------------------------------------------------------

    const pedalNodes =
        node.querySelectorAll(
            ":scope > direction-type > pedal"
        );

    for (const pedalNode of pedalNodes) {

        const pedalType =
            pedalNode.getAttribute("type");

        if (
            pedalType !== "start" &&
            pedalType !== "stop" &&
            pedalType !== "change"
        ) {
            continue;
        }

        const staffNode =
            node.querySelector(":scope > staff");

        const staff = staffNode
            ? parseInt(staffNode.textContent)
            : null;

        const pedalEvent = {

            type: "pedal",

            action: pedalType,

            tick: this.currentTick,

            measure: this.currentMeasure,

            part: this.currentPart,

            staff: staff

        };

        this.pedalEvents.push(pedalEvent);

        console.log(
            "PEDÁL:",
            pedalType,
            "takt:", this.currentMeasure,
            "tick:", this.currentTick,
            "part:", this.currentPart,
            "staff:", staff
        );

    }

    // ---------------------------------------------------------
    // DYNAMICKÁ ZNAČKA
    // p, pp, ppp, mp, mf, f, ff, fff...
    // ---------------------------------------------------------

    const dynamicsNodes =
        node.querySelectorAll(
            ":scope > direction-type > dynamics"
        );

    for (const dynamicsNode of dynamicsNodes) {

        let value = null;

        for (const child of dynamicsNode.children) {

            if (child.nodeName === "other-dynamics") {

                value = child.textContent.trim();

            } else {

                value = child.nodeName.toLowerCase();

            }

            if (value) break;

        }

        if (!value) continue;


        // Hodnota dynamics je u našich XML souborů
        // uložena v <sound dynamics="...">

        const soundNode =
            node.querySelector(":scope > sound");

        let dynamics = null;

        if (soundNode) {

            const dynamicsAttribute =
                soundNode.getAttribute("dynamics");

            if (dynamicsAttribute !== null) {

                dynamics =
                    parseFloat(dynamicsAttribute);

                if (isNaN(dynamics)) {
                    dynamics = null;
                }

            }

        }


        const staffNode =
            node.querySelector(":scope > staff");

        const staff = staffNode
            ? parseInt(staffNode.textContent)
            : null;


        const event = {

            type: "dynamic",

            value: value,

            dynamics: dynamics,

            tick: this.currentTick,

            measure: this.currentMeasure,

            part: this.currentPart,

            staff: staff

        };


        this.dynamicEvents.push(event);

    }


    // ---------------------------------------------------------
    // CRESCENDO / DIMINUENDO
    // ---------------------------------------------------------

    const wedgeNodes =
        node.querySelectorAll(
            ":scope > direction-type > wedge"
        );

    for (const wedgeNode of wedgeNodes) {

        const wedgeType =
            wedgeNode.getAttribute("type");

        if (!wedgeType) continue;


        if (
            wedgeType !== "crescendo" &&
            wedgeType !== "diminuendo" &&
            wedgeType !== "decrescendo" &&
            wedgeType !== "stop"
        ) {
            continue;
        }


        const number =
            wedgeNode.getAttribute("number") || "1";


        const staffNode =
            node.querySelector(":scope > staff");

        const staff = staffNode
            ? parseInt(staffNode.textContent)
            : null;


        const event = {

            type: "wedge",

            value: wedgeType,

            number: number,

            tick: this.currentTick,

            measure: this.currentMeasure,

            part: this.currentPart,

            staff: staff

        };


        this.dynamicEvents.push(event);


        

    }

}

   parseBackup(node) {

    const duration = this.getInt(node, "duration", 0);

    this.currentTick -= duration;

    if (this.currentTick < 0) {
        this.currentTick = 0;
    }

}

    parseForward(node) {

    const duration = this.getInt(node, "duration", 0);

    this.currentTick += duration;

}

    parseNote(node) {

    const isRest = node.querySelector("rest") !== null;
    const isChord = node.querySelector("chord") !== null;
    const tieStart = node.querySelector('tie[type="start"]') !== null;
    const tieStop = node.querySelector('tie[type="stop"]') !== null;
    const tiedStart =                                            //přidáno
    node.querySelector('notations tied[type="start"]') !== null;

const tiedStop =
    node.querySelector('notations tied[type="stop"]') !== null;

                  //----------------------------přidáno konec

    const duration = this.getInt(node, "duration", 0);

    const voice = this.getInt(node, "voice", 1);

    const staff = this.getInt(node, "staff", 1);

    let midi = null;

    if (!isRest) {

        const step = this.getText(node, "pitch > step", "C");

        const alter = this.getInt(node, "pitch > alter", 0);

        const octave = this.getInt(node, "pitch > octave", 4);

        midi = this.pitchToMidi(step, alter, octave);
        if (tiedStart || tiedStop) {

   /* console.log(
        "TIED:",
        "takt", this.currentMeasure,
        "tick", this.currentTick,
        "midi", midi,
        "start", tiedStart,
        "stop", tiedStop
    );*/

   } 

    }

    const tick = isChord
        ? this.currentTick - duration
        : this.currentTick;
        // ---------------------------------------------------------
// ARPEGGIO
// <arpeggiate direction="up/down"/>
// ---------------------------------------------------------

let arpeggio = false;
let arpeggioDirection = "up";

const arpeggioNode =
    node.querySelector(
        ":scope > notations > arpeggiate"
    );

if (arpeggioNode) {

    arpeggio = true;

    const direction =
        arpeggioNode.getAttribute("direction");

    if (direction === "down") {
        arpeggioDirection = "down";
    }

}
   /* console.log(
    "Parser:",
    this.currentMeasure,
    "tick:",
    tick,
    "rest:",
    isRest
);   */ 
    // ---------------------------------------------------------
// GLISSANDO
// <glissando> nebo <slide> type="start/stop" number="..."/>
// ---------------------------------------------------------

let glissandoStart = false;
let glissandoStop = false;
let glissandoStartNumber = "1";
let glissandoStopNumber = "1";

// <slide> a <glissando> jsou v tomto testovacím souboru
// dva různé způsoby zápisu.
//
// <slide> (takt 12–13) = skutečné plynulé sklouznutí pomocí pitch wheel.
// <glissando> = původní chromatické přehrávání po jednotlivých tónech.
// Proto je musíme v parseru rozlišit.
let slideStart = false;
let slideStop = false;
let slideStartNumber = "1";
let slideStopNumber = "1";

const glissandoNodes =
    node.querySelectorAll(
        ":scope > notations > glissando"
    );

for (const glissandoNode of glissandoNodes) {

    const type =
        glissandoNode.getAttribute("type");

    const number =
        glissandoNode.getAttribute("number") || "1";

    if (type === "start") {
        glissandoStart = true;
        glissandoStartNumber = number;
    }

    if (type === "stop") {
        glissandoStop = true;
        glissandoStopNumber = number;
    }

}

const slideNodes =
    node.querySelectorAll(
        ":scope > notations > slide"
    );

for (const slideNode of slideNodes) {

    const type =
        slideNode.getAttribute("type");

    const number =
        slideNode.getAttribute("number") || "1";

    if (type === "start") {
        slideStart = true;
        slideStartNumber = number;
    }

    if (type === "stop") {
        slideStop = true;
        slideStopNumber = number;
    }

}

// ---------------------------------------------------------
    // ARTIKULACE
    // staccato, staccatissimo, tenuto,
    // accent, strong-accent
    // ---------------------------------------------------------

    const articulations = [];

    const articulationNodes =
        node.querySelectorAll(
            ":scope > notations > articulations > *"
        );

    for (const articulationNode of articulationNodes) {

        const name =
            articulationNode.nodeName.toLowerCase();

        if (
            name === "staccato" ||
            name === "staccatissimo" ||
            name === "tenuto" ||
            name === "accent" ||
            name === "strong-accent"
        ) {

            articulations.push(name);

          /**  console.log(
                "ARTIKULACE:",
                name,
                "takt:", this.currentMeasure,
                "tick:", tick,
                "part:", this.currentPart,
                "staff:", staff
            );*/

        }

    }
    // ---------------------------------------------------------
// TRYLEK
// obyčejný <trill-mark/>
// ---------------------------------------------------------

const trillMark =
    node.querySelector(
        ":scope > notations > ornaments > trill-mark"
    ) !== null;
    
    // ---------------------------------------------------------
// VLVNOVKA TRYLKU
// wavy-line start / stop
// ---------------------------------------------------------

let trillWavyStart = false;
let trillWavyStop = false;
let trillWavyNumber = null;

const wavyLineNodes =
    node.querySelectorAll(
        ":scope > notations > ornaments > wavy-line"
    );

for (const wavyLineNode of wavyLineNodes) {

    const type =
        wavyLineNode.getAttribute("type");

    const number =
        wavyLineNode.getAttribute("number") || "1";

    if (type === "start") {

        trillWavyStart = true;
        trillWavyNumber = number;

        console.log(
            "TRYL WAVE START:",
            "takt:", this.currentMeasure,
            "tick:", tick,
            "part:", this.currentPart,
            "staff:", staff,
            "number:", number
        );

    }

    if (type === "stop") {

        trillWavyStop = true;

        if (!trillWavyNumber) {
            trillWavyNumber = number;
        }

        console.log(
            "TRYL WAVE STOP:",
            "takt:", this.currentMeasure,
            "tick:", tick,
            "part:", this.currentPart,
            "staff:", staff,
            "number:", number
        );

    }

}

     if (this.currentMeasure <= 4) {
   /* console.log(
        "EVENT",
        "measure:", this.currentMeasure,
        "currentTick:", this.currentTick,
        "tick:", tick,
        "duration:", duration,
        "chord:", isChord,
        "rest:", isRest
    );*/
}

    // ---------------------------------------------------------
    // KORUNA / FERMATA
    // <fermata> znamená prodloužení právě znějícího tónu.
    // ---------------------------------------------------------

    const fermata =
        node.querySelector(":scope > notations > fermata") !== null;

    this.createEvent({

    part: this.currentPart,

    measure: this.currentMeasure,

    tick: tick,

    duration: duration,

    divisions: this.divisions,

    voice: voice,

    staff: staff,

    midi: midi,

    chord: isChord,

    rest: isRest,

    tieStart: tieStart,

tieStop: tieStop,

articulations: articulations,
trillMark: trillMark,

trillWavyStart: trillWavyStart,

trillWavyStop: trillWavyStop,

trillWavyNumber: trillWavyNumber,

arpeggio: arpeggio,

arpeggioDirection: arpeggioDirection,

glissandoStart: glissandoStart,

glissandoStop: glissandoStop,

glissandoStartNumber: glissandoStartNumber,

glissandoStopNumber: glissandoStopNumber,

slideStart: slideStart,

slideStop: slideStop,

slideStartNumber: slideStartNumber,

slideStopNumber: slideStopNumber,

fermata: fermata


});

    if (!isChord) {

        this.currentTick += duration;

    }

}



    getInt(node, selector, value = 0) {

        const n = node.querySelector(selector);

        if (!n) return value;

        return parseInt(n.textContent);

    }

    getText(node, selector, value = "") {

        const n = node.querySelector(selector);

        if (!n) return value;

        return n.textContent;
 
    }

    pitchToMidi(step, alter, octave) {

        const table = {

            C: 0,
            D: 2,
            E: 4,
            F: 5,
            G: 7,
            A: 9,
            B: 11

        };

        return (octave + 1) * 12 + table[step] + alter;

    }

   createEvent(data) {

   /* if (data.tieStart || data.tieStop) {

        console.log(
            "TIE:",
            "takt", data.measure,
            "tick", data.tick,
            "midi", data.midi,
            "start", data.tieStart,
            "stop", data.tieStop
        );

    }*/

    this.events.push(data);

}

}




