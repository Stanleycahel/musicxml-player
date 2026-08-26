# MusicXML Player

A browser-based MusicXML player built with JavaScript, OpenSheetMusicDisplay and SpessaSynth.

The project started as a small experiment for playing MusicXML scores in a web browser and gradually grew into a more complete player with support for polyphony, tempo changes, dynamics, ornaments and visual score tracking.

## Features

- MusicXML loading and parsing
- Sheet-music rendering with OpenSheetMusicDisplay
- Real-time SoundFont playback in the browser
- Play / Pause
- Stop and cleanly release active notes
- Polyphony and multiple voices
- Tempo control
- Tempo changes defined in MusicXML
- Measure tracking
- Highlighting of the currently playing measure
- Loop playback between measures
- Repeats and basic navigation support
- Dynamics
- Crescendo / decrescendo
- Arpeggio
- Glissando
- Trill
- Pedal events
- MIDI instrument / program handling
- Rest handling
- Web Audio / AudioWorklet based synthesis

## Technologies

- JavaScript ES Modules
- MusicXML
- OpenSheetMusicDisplay
- SpessaSynth
- SoundFont 2
- Web Audio API
- SVG
- PHP

## Project structure

```text
musicxmlplayer1.1/
├── playerxml/
│   ├── musicXMLLoader.js
│   ├── musicXMLParser.js
│   ├── player.js
│   ├── playerxml.php
│   ├── scheduler.js
│   ├── scoreRenderer.js
│   ├── songPlayer.js
│   ├── soundFontPlayer.js
│   ├── soundfonts/
│   └── vendor/
│       ├── opensheetmusicdisplay.min.js
│       ├── opensheetmusicdisplayold.min.js
│       ├── spessasynth.bundle.js
│       └── spessasynth_processor.min.js
├── README.md
├── README.cs.md
├── LICENSE
├── THIRD-PARTY-NOTICES.md
└── .gitignore
```

## Running the project

The project is intended to run from a web server.

PHP is used by the player component, while JavaScript loads MusicXML and the SoundFont through HTTP. Running the project through a local web server is therefore recommended instead of opening the PHP files directly from the filesystem.

For example, with a PHP-enabled local server:

1. Copy the project into the server's web directory.
2. Make sure the SoundFont file is present in `playerxml/soundfonts/`.
3. Configure the MusicXML file used by the player.
4. Open the corresponding PHP page in a modern browser.

Chrome, Edge and Firefox should work with the required Web Audio API and AudioWorklet features.

## How the player works

The main playback pipeline is:

```text
MusicXML
   ↓
MusicXMLLoader
   ↓
MusicXMLParser
   ↓
Scheduler
   ↓
SoundFontPlayer
   ↓
SpessaSynth / Web Audio
```

At the same time, `ScoreRenderer` renders the score using OpenSheetMusicDisplay and keeps the visual measure highlighting synchronized with playback.

### MusicXMLLoader

Loads the MusicXML file and converts it into an XML document.

### MusicXMLParser

Converts MusicXML data into playback events, measures, tempo events, dynamics, pedal events, repeats and navigation information.

### Scheduler

Schedules note-on and note-off events according to musical timing and the current tempo.

### SoundFontPlayer

Connects playback events to the SoundFont synthesizer. It also keeps track of active notes so that overlapping notes and multiple voices can be handled correctly.

### ScoreRenderer

Renders the score and creates the visual map used to highlight the measure currently being played.

## Polyphony and multiple voices

One of the important problems solved during development was correctly handling multiple voices in the same staff.

A simple note-on / note-off implementation can leave a note sounding when two voices use the same MIDI pitch. The player therefore keeps track of active notes and handles note release more carefully.

This is particularly important when pressing Pause or stopping playback.

## SoundFont

The player uses a SoundFont for audio generation.

The SoundFont is loaded by SpessaSynth during player initialization. A different SoundFont can be used by changing the configured file and path.

**Important:** SoundFont files can have their own copyright and redistribution conditions. Before publishing a SoundFont in a public repository, check its license carefully.

## MusicXML files

MusicXML files can be placed in the location expected by the player and loaded through the configured path.

When publishing your own scores, make sure you have permission to redistribute them.

## Third-party software

This repository includes third-party browser builds.

- OpenSheetMusicDisplay — BSD-3-Clause
- SpessaSynth — Apache-2.0

See `THIRD-PARTY-NOTICES.md` for details and official project links.

## Development notes

This project was developed incrementally by testing individual playback features and fixing real-world MusicXML playback problems.

The code is intentionally kept relatively straightforward so that the individual stages of loading, parsing, scheduling, synthesis and rendering can be followed and modified.

It is not intended to replace a complete professional notation engine. MusicXML is a large standard and different scores can use features that require additional parser support.

## Contributing

Suggestions, bug reports and improvements are welcome.

If you find a MusicXML file that does not play correctly, a useful bug report should include:

- the MusicXML file, if redistribution is allowed
- what was expected to happen
- what actually happened
- the browser used
- any relevant console error

## License

The original MusicXML Player code is released under the MIT License.

Third-party components included in the repository remain under their respective licenses. See `THIRD-PARTY-NOTICES.md`.

## Project status

The player is functional and actively extensible.

The project is primarily a practical MusicXML playback experiment that has grown into a fairly capable browser-based player.

If this project helps you build your own MusicXML player, feel free to use it as a starting point while respecting the licenses of the included third-party components.
