export default class SoundFontPlayer {

    constructor(synth) {

        this.synth = synth;

        this.channel = 0;

        this.velocity = 100;

        this.program = 0;
        this.instruments = new Map();

        // Počet právě znějících tónů podle kanálu a MIDI noty.
        // Důležité pro polyfonii, více hlasů i stejnou notu ve dvou hlasech.
        this.activeNotes = new Map();

    }

    _noteKey(channel, midi) {
        return `${channel}:${midi}`;
    }

    setChannel(channel) {

        this.channel = channel;

    }

    setVelocity(velocity) {

        this.velocity = velocity;

    }

    setProgram(program) {

        this.program = program;

        if (this.synth) {

            this.synth.programChange(
                this.channel,
                this.program
            );

        }

    }
    
    setInstruments(instruments) {

    this.instruments.clear();

    if (!instruments || !instruments.length) {
        return;
    }

    for (const instrument of instruments) {

        const channel = instrument.channel - 1;
        const program = instrument.program - 1;

        this.instruments.set(
            instrument.part,
            {
                channel: channel,
                program: program
            }
        );

        if (this.synth) {

            this.synth.programChange(
                channel,
                program
            );

        }

    }

}

    noteOn(event) {

    if (!this.synth)
        return;

    if (event.rest)
        return;

    const instrument =
        this.instruments.get(event.part);

    if (!instrument) {
        return;
    }

    const channel = instrument.channel;
    const midi = event.midi;
    const key = this._noteKey(channel, midi);

    this.synth.noteOn(
        channel,
        midi,
        event.velocity ?? this.velocity
    );

    this.activeNotes.set(
        key,
        (this.activeNotes.get(key) || 0) + 1
    );

}

    noteOff(event) {

    if (!this.synth)
        return;

    if (event.rest)
        return;

    const instrument =
        this.instruments.get(event.part);

    if (!instrument) {
        return;
    }

    const channel = instrument.channel;
    const midi = event.midi;
    const key = this._noteKey(channel, midi);

    const count = this.activeNotes.get(key) || 0;

    if (count <= 0) {
        return;
    }

    this.synth.noteOff(
        channel,
        midi
    );

    if (count === 1) {
        this.activeNotes.delete(key);
    } else {
        this.activeNotes.set(
            key,
            count - 1
        );
    }

}

    pedal(event) {

    if (!this.synth || !event)
        return;

    const instrument =
        this.instruments.get(event.part);

    if (!instrument)
        return;

    const channel = instrument.channel;

    if (typeof this.synth.controllerChange !== "function") {
        console.warn("PEDÁL: synth.controllerChange není dostupné.");
        return;
    }

    if (event.action === "start") {

        this.synth.controllerChange(
            channel,
            64,
            127
        );

    } else if (event.action === "stop") {

        this.synth.controllerChange(
            channel,
            64,
            0
        );

    } else if (event.action === "change") {

        this.synth.controllerChange(
            channel,
            64,
            0
        );

        this.synth.controllerChange(
            channel,
            64,
            127
        );

    }

}

    stopAll() {

    if (!this.synth)
        return;

    const channels = new Set();

    for (const instrument of this.instruments.values()) {
        channels.add(instrument.channel);
    }

    if (channels.size === 0) {
        channels.add(this.channel);
    }

    /*
     * Nejdříve vypneme sustain.
     * Tím zabráníme tomu, aby pedál po Pause držel tón dál.
     */
    if (typeof this.synth.controllerChange === "function") {

        for (const channel of channels) {

            this.synth.controllerChange(
                channel,
                64,
                0
            );

        }

    }

    /*
     * Vypneme přesně ty tóny, které Scheduler skutečně spustil.
     * Počítadlo je důležité při dvou hlasech, které mají stejnou
     * MIDI notu na stejném kanálu.
     */
    for (const [key, count] of this.activeNotes) {

        const [channelText, midiText] = key.split(":");

        const channel = Number(channelText);
        const midi = Number(midiText);

        for (let i = 0; i < count; i++) {

            this.synth.noteOff(
                channel,
                midi
            );

        }

    }

    /*
     * Vyčistíme stav až po odeslání všech NOTE OFF.
     */
    this.activeNotes.clear();

}


}
