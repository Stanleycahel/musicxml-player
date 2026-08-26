import SongPlayer from "./songPlayer.js";
import ScoreRenderer from "./scoreRenderer.js";

const status = document.getElementById("spessaStatus");
const playButton = document.getElementById("btnPlayPause");
const tempoDown = document.getElementById("tempoDown");
const tempoUp = document.getElementById("tempoUp");
const tempoValue = document.getElementById("tempoValue");
const btnHome = document.getElementById("btnHome");
const loopButton = document.getElementById("btnLoop");
const loopRange = document.getElementById("loopRange");
const loopDialog = document.getElementById("loopDialog");
const loopDialogTitle = document.getElementById("loopDialogTitle");
const loopMeasureInput = document.getElementById("loopMeasureInput");
const loopDialogOk = document.getElementById("loopDialogOk");
const btnFullscreen = document.getElementById("btnFullscreen");

function updateTempo() {

    tempoValue.textContent =
        Math.round(songPlayer.tempo / songPlayer.baseTempo * 100) + " %";

}

function setStatus(text) {
    if (status) status.textContent = text;
}

if (playButton) {
    playButton.disabled = true;
}

let audioContext = null;
let synth = null;
let scoreRenderer = null;
let songPlayer = null;
let selectedMeasure = 1;
let loopStart = null;
let loopEnd = null;
let loopDialogStep = "start";



async function init() {

    try {

        setStatus("Načítám SpessaSynth...");

        const { WorkletSynthesizer } = await import(
            PlayerXML.vendorPath + "/spessasynth.bundle.js"
        );

       // console.log("✓ Bundle načten");

        audioContext = new AudioContext();

        await audioContext.audioWorklet.addModule(
            PlayerXML.vendorPath + "/spessasynth_processor.min.js"
        );

        //console.log("✓ AudioWorklet načten");

        synth = new WorkletSynthesizer(audioContext);
        
        synth.connect(audioContext.destination);

console.log("✓ Synth připojen na destination");

       // console.log("✓ Synth vytvořen");

        setStatus("Načítám SoundFont...");

        const sfUrl =
            PlayerXML.vendorPath + "/../soundfonts/default.sf2"; // 8bitsf.SF2 , načtení banky sf2

        //console.log("SoundFont:", sfUrl);

        const sfResponse = await fetch(sfUrl);

       // console.log("HTTP:", sfResponse.status);

        if (!sfResponse.ok) {
            throw new Error("Nelze načíst SoundFont.");
        }

        const sfBuffer = await sfResponse.arrayBuffer();

        console.log("Velikost SF2:", sfBuffer.byteLength);

        console.log("Přidávám SoundBank...");

        await synth.soundBankManager.addSoundBank(sfBuffer, "main");

       // console.log("✓ SoundBank přidána");

        await synth.isReady;

       // console.log("✓ Synth READY");
        scoreRenderer = new ScoreRenderer("score");

scoreRenderer.onMeasureClicked = (measureNumber) => {

    selectedMeasure = measureNumber;

    scoreRenderer.highlightMeasure(measureNumber);

    // Pokud je otevřený dialog Loop
    if (loopDialog.style.display === "block") {

        loopMeasureInput.value = measureNumber;

        console.log(
            "LOOP TAKT Z OSNOVY:",
            measureNumber
        );
    }
};


        songPlayer = new SongPlayer(synth);
        
        songPlayer.setNoteCallback(() => {
        });
        songPlayer.setTickChangedCallback((tick) => {

    /*
     * Scheduler nyní pracuje s absolutními tick hodnotami
     * celé skladby i při spuštění od libovolného taktu.
     * Proto už zde playbackStartTick nepřičítáme.
     */
    scoreRenderer.highlightTick(tick);

});

// Stav přehrávání – zobrazí právě hraný takt.
songPlayer.setMeasureChangedCallback((measureNumber) => {

    setStatus(`Hraje takt ${measureNumber}`);

});
        
        updateTempo();

songPlayer.setFinishedCallback(() => {

    console.log("KONEC SKLADBY");

    playButton.textContent = "▶";

    scoreRenderer.clearHighlight();

    selectedMeasure = 1;

    setStatus("Konec skladby");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

});



await scoreRenderer.load(PlayerXML.musicxml);
await songPlayer.load(PlayerXML.musicxml);
//scoreRenderer.setEvents(songPlayer.events);
updateTempo();
scoreRenderer.setMeasureStarts(songPlayer.measureStarts);
//console.log(scoreRenderer);

        

        window.playerxml = {
            audioContext,
            synth
        };

        if (playButton) {
    playButton.disabled = false;
}

        setStatus("Připraveno");
        








    }
    catch (err) {

        console.error(err);

        setStatus("Chyba inicializace");

    }

}



init();

playButton.addEventListener("click", async () => {

   // console.count("PLAY stisk");

    if (!songPlayer) return;
    
    if (songPlayer.isPlaying) {

    songPlayer.pause();

    playButton.textContent = "▶";
    setStatus("Pozastaveno");

    return;

}

if (songPlayer.scheduler.isPaused) {

    songPlayer.resume();

    playButton.textContent = "⏸";
    setStatus("Přehrávám");

    return;

}

    if (audioContext.state !== "running") {
        await audioContext.resume();
    }

    playButton.disabled = true;

    try {

        playButton.textContent = "⏸";
        
        

        const playStartMeasure =
    (loopStart !== null && loopEnd !== null)
        ? loopStart
        : selectedMeasure;

await songPlayer.play(
    PlayerXML.musicxml,
    playStartMeasure
);

    } finally {

        
        playButton.disabled = false;

    }

});

btnHome.addEventListener("click", () => {

    if (!songPlayer) return;

    songPlayer.stop();

    // zrušit Loop
    loopStart = null;
    loopEnd = null;
    loopRange.textContent = "";

    songPlayer.setLoop(null, null);

    // zavřít dialog
    loopDialog.style.display = "none";

    loopMeasureInput.value = "";

    loopDialogStep = "start";

    playButton.textContent = "▶";

    scoreRenderer.clearHighlight();

    selectedMeasure = 1;

    setStatus("Připraveno");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});

tempoUp.addEventListener("click", () => {

    if (songPlayer.tempo < 240) {

        songPlayer.tempo += 5;  //změna tempa 
        
        console.log("TEMPO UŽIVATEL:", songPlayer.tempo);

        updateTempo();

    }

});

tempoDown.addEventListener("click", () => {

    if (songPlayer.tempo > 30) {

        songPlayer.tempo -= 5;
        console.log("TEMPO UŽIVATEL:", songPlayer.tempo);
        updateTempo();

    }

});
loopButton.addEventListener("click", () => {

    loopDialogTitle.textContent = "Zadej začátek smyčky";

    loopMeasureInput.value = "";

    loopDialog.style.display = "block";

    loopMeasureInput.focus();

});

loopDialogOk.addEventListener("click", () => {

    const measure = parseInt(loopMeasureInput.value);

    if (!measure || measure < 1) {
        return;
    }

    // první OK = začátek
    if (loopStart === null) {

        loopStart = measure;

        console.log("LOOP ZAČÁTEK Z OKNA:", loopStart);

        loopDialogTitle.textContent = "Zadej konec smyčky";

        loopMeasureInput.value = "";

        loopMeasureInput.focus();

        return;
    }

    // druhé OK = konec
    loopEnd = measure;

    console.log("LOOP KONEC Z OKNA:", loopEnd);
    loopRange.textContent = `${loopStart}/${loopEnd}`;

    console.log(
        "LOOP ROZSAH:",
        loopStart,
        "→",
        loopEnd
    );

    songPlayer.setLoop(loopStart, loopEnd);

    loopDialog.style.display = "none";

});

// ========================================
// CELÁ OBRAZOVKA
// ========================================

if (btnFullscreen) {

    btnFullscreen.addEventListener("click", async () => {

        const player = document.getElementById("playerxml");

        if (!player) return;

        try {

            if (!document.fullscreenElement) {

                await player.requestFullscreen();

            } else {

                await document.exitFullscreen();

            }

        } catch (err) {

            console.error("Fullscreen chyba:", err);

        }

    });


    document.addEventListener("fullscreenchange", () => {

        if (!scoreRenderer) return;

        // počkáme, až prohlížeč dokončí změnu velikosti
        requestAnimationFrame(() => {

            requestAnimationFrame(async () => {

                await scoreRenderer.refreshAfterResize(
                    songPlayer ? songPlayer.measureStarts : null
                );

            });

        });

    });

  }
