import MusicXMLLoader from "./musicXMLLoader.js";
import MusicXMLParser from "./musicXMLParser.js";
import Scheduler from "./scheduler.js";
import SoundFontPlayer from "./soundFontPlayer.js";

export default class SongPlayer {

    constructor(synth) {

        this.synth = synth;

        this.player = new SoundFontPlayer(synth);

        this.scheduler = new Scheduler(this.player);
        
             
        this.tempo = 120;
        this.baseTempo = 120;
        
        this.isPlaying = false;
        this.loopStart = null;
        this.loopEnd = null;

    }
    setTickChangedCallback(callback) {

    this.scheduler.setTickChangedCallback(callback);

}

    async load(path) {

    const xml = await MusicXMLLoader.load(path);

    const parsed = MusicXMLParser.parse(xml);

    this.events = parsed.events;
    this.measureEvents = parsed.measureEvents;
    this.measureStarts = parsed.measureStarts;
    this.tempo = parsed.tempo;
    this.baseTempo = parsed.tempo;
    this.tempoEvents = parsed.tempoEvents;
    this.dynamicEvents = parsed.dynamicEvents;
    this.pedalEvents = parsed.pedalEvents || [];
    this.repeatSections = parsed.repeatSections || [];
    this.navigation = parsed.navigation || null;
    this.instruments = parsed.instruments;
    this.applyBaseDynamics();
    
   // console.log("Dynamic events:", this.dynamicEvents);

   // console.log("Tempo skladby:", this.tempo);
  // console.log("Tempo events:", this.tempoEvents);
  // console.log("NÁSTROJE SONGPLAYER:", this.instruments);

    return this.events;
}

    async play(path, startMeasure = 1) {

        if (!this.events) {

            await this.load(path);

        }

        this.player.setInstruments(
    this.instruments
);
        
        this.isPlaying = true;

        /*
         * Scheduler dostává celou skladbu s absolutními tick hodnotami.
         * Startovací takt se už nesmí odříznout ani přepočítat na tick 0,
         * protože repeat/volta jsou definované vůči celé skladbě.
         */
        const startTick =
            startMeasure <= 1
                ? 0
                : this.findStartTick(startMeasure);

this.scheduler.play(
    this.events,
    this.tempo,
    this.tempoEvents,
    this.measureEvents,
    this.loopStart,
    this.loopEnd,
    this.pedalEvents,
    this.repeatSections,
    this.navigation,
    startTick
);

//console.log("Tempo events:", this.tempoEvents);

    }

    stop() {
    
        this.isPlaying = false;

        this.scheduler.stop();

    }
    
    pause() {

    this.isPlaying = false;

    this.scheduler.pause();

}

resume() {

    this.isPlaying = true;

    this.scheduler.resume();

}

    setProgram(program) {

        this.player.setProgram(program);

    }
    
    setLoop(start, end) {

    this.loopStart = start;
    this.loopEnd = end;

    //console.log("SongPlayer LOOP:", start, "→", end);
}

    setFinishedCallback(callback) {

    this.scheduler.setFinishedCallback(() => {

        this.isPlaying = false;

        if (callback) {
            callback();
        }

    });

}

setMeasureChangedCallback(callback) {

    this.scheduler.setMeasureChangedCallback(callback);

}

setNoteCallback(callback) {

    this.scheduler.setNoteCallback(callback);

}

findStartTick(startMeasure) {

    if (startMeasure <= 1) {
        return 0;
    }

    const measure =
        this.measureEvents.find(
            event => event.measure === startMeasure
        );

    return measure
        ? measure.tick
        : 0;
}

/*
 * Zachováno kvůli případnému staršímu volání.
 * Události už se ale neposouvají na tick 0.
 */
prepareEvents(startMeasure) {

    this.playbackStartTick =
        this.findStartTick(startMeasure);

    return this.events;
}


applyBaseDynamics() {

    if (!this.events || !this.dynamicEvents) {
        return;
    }

    // ---------------------------------------------------------
    // Pomocné funkce
    // ---------------------------------------------------------

    const clampVelocity = value => {

        return Math.max(
            1,
            Math.min(
                127,
                Math.round(value)
            )
        );

    };


    const getBaseDynamic = (part, tick, staff) => {

        const dynamics = this.dynamicEvents
            .filter(dynamic =>
                dynamic.type === "dynamic" &&
                dynamic.part === part &&
                dynamic.tick <= tick &&
                (
                    dynamic.staff === null ||
                    dynamic.staff === staff
                )
            )
            .sort((a, b) => a.tick - b.tick);

        if (dynamics.length === 0) {
            return 100;
        }

        const dynamic =
            dynamics[dynamics.length - 1];

        if (dynamic.dynamics === null) {
            return 100;
        }

        return dynamic.dynamics;

    };


    // ---------------------------------------------------------
    // Nejprve základní dynamika
    // ---------------------------------------------------------

    for (const event of this.events) {

        event.velocity = clampVelocity(
            getBaseDynamic(
                event.part,
                event.tick,
                event.staff
            )
        );

    }


    // ---------------------------------------------------------
    // CRESCENDO / DIMINUENDO
    // ---------------------------------------------------------

    const wedges =
        this.dynamicEvents
            .filter(event =>
                event.type === "wedge" &&
                (
                    event.value === "crescendo" ||
                    event.value === "diminuendo" ||
                    event.value === "decrescendo"
                )
            );


    for (const wedge of wedges) {

        // Najdeme odpovídající STOP:
        // stejný part + stejné číslo wedge.
        const stop =
            this.dynamicEvents
                .filter(event =>
                    event.type === "wedge" &&
                    event.value === "stop" &&
                    event.part === wedge.part &&
                    event.number === wedge.number &&
                    event.tick >= wedge.tick
                )
                .sort((a, b) => a.tick - b.tick)[0];


        if (!stop) {

            console.warn(
                "WEDGE BEZ STOP:",
                wedge
            );

            continue;

        }


        const startTick = wedge.tick;
        const endTick = stop.tick;


        if (endTick <= startTick) {
            continue;
        }


        // Dynamika na začátku wedge.
        const startVelocity =
            getBaseDynamic(
                wedge.part,
                startTick,
                wedge.staff
            );


        // Dynamika, která platí po skončení wedge.
        //
        // Pokud za stopem není nová dynamická značka,
        // použijeme hodnotu z nejbližší následující značky.
        const followingDynamics =
            this.dynamicEvents
                .filter(event =>
                    event.type === "dynamic" &&
                    event.part === wedge.part &&
                    event.tick >= endTick &&
                    (
                        event.staff === null ||
                        event.staff === wedge.staff
                    )
                )
                .sort((a, b) => a.tick - b.tick);


        let endVelocity = startVelocity;


        if (followingDynamics.length > 0) {

            const nextDynamic =
                followingDynamics[0];

            if (nextDynamic.dynamics !== null) {

                endVelocity =
                    nextDynamic.dynamics;

            }

        }

        // -----------------------------------------------------
        // Přiřadíme interpolovanou velocity jednotlivým notám
        // -----------------------------------------------------

        for (const event of this.events) {

            if (event.rest) {
                continue;
            }

            if (event.part !== wedge.part) {
                continue;
            }

            if (
                wedge.staff !== null &&
                event.staff !== wedge.staff
            ) {
                continue;
            }

            if (
                event.tick < startTick ||
                event.tick > endTick
            ) {
                continue;
            }


            const progress =
                (event.tick - startTick) /
                (endTick - startTick);


            const velocity =
                startVelocity +
                (
                    endVelocity -
                    startVelocity
                ) * progress;


            event.velocity =
                clampVelocity(velocity);

        }

    }


    // ---------------------------------------------------------
    // Kontrola několika prvních not
    // ---------------------------------------------------------

   /* console.log(
        "DYNAMIKA PŘIŘAZENA NOTÁM:",
        this.events
            .filter(event => !event.rest)
            .slice(0, 20)
            .map(event => ({
                part: event.part,
                tick: event.tick,
                midi: event.midi,
                velocity: event.velocity
            }))
    );*/

}

}
   


