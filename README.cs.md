# MusicXML Player – český popis

Webový přehrávač MusicXML vytvořený v JavaScriptu.

Projekt začal jako jednoduchý pokus o přehrávání MusicXML partitury přímo v internetovém prohlížeči a postupně se rozšířil o vícehlas, změnu tempa, dynamiku, ozdoby, smyčky a vizuální sledování právě přehrávaného taktu.

> Hlavní dokumentace projektu je v angličtině v souboru `README.md`, protože projekt je určen i pro veřejné sdílení na GitHubu.

## Funkce

- načítání a parsování MusicXML
- zobrazení not pomocí OpenSheetMusicDisplay
- přehrávání pomocí SoundFont syntézy
- Play / Pause
- správné zastavení právě znějících tónů
- vícehlas a polyfonie
- změna tempa
- tempo události z MusicXML
- sledování taktů
- zvýraznění právě přehrávaného taktu
- přehrávání smyčky mezi takty
- opakování a základní navigace
- dynamika
- crescendo / decrescendo
- arpeggio
- glissando
- trill
- pedálové události
- MIDI program / nástroj
- pomlky
- Web Audio / AudioWorklet syntéza

## Použité technologie

- JavaScript ES Modules
- MusicXML
- OpenSheetMusicDisplay
- SpessaSynth
- SoundFont 2
- Web Audio API
- SVG
- PHP

## Jak projekt spustit

Projekt je určen pro spuštění přes webový server.

PHP používá část přehrávače a JavaScript načítá MusicXML i SoundFont přes HTTP. Proto je vhodné projekt spouštět přes lokální nebo veřejný webový server, nikoliv otevírat PHP soubory přímo z disku.

### Základní postup

1. Nahraj projekt do webového serveru s podporou PHP.
2. Zkontroluj, že je SoundFont ve složce `playerxml/soundfonts/`.
3. Nastav MusicXML soubor, který má přehrávač načítat.
4. Otevři příslušnou PHP stránku v moderním prohlížeči.

## Jak přehrávač funguje

Hlavní cesta dat je:

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

Současně `ScoreRenderer` vykresluje notový zápis a synchronizuje zvýraznění právě přehrávaného taktu.

## Důležitá poznámka k vícehlasu

Během vývoje byl řešen problém, kdy při více hlasech mohl po stisknutí Pause některý tón zůstat znít.

Přehrávač proto sleduje aktivní tóny a jejich správné ukončení. To je důležité hlavně v situaci, kdy dva hlasy používají stejnou MIDI notu.

## SoundFont

Přehrávač používá SoundFont pro tvorbu zvuku.

Před zveřejněním konkrétního SoundFontu na veřejném GitHubu je nutné ověřit jeho licenci a možnost redistribuce.

Stejně tak je potřeba respektovat licenci u zveřejňovaných MusicXML skladeb.

## Licence

Vlastní kód MusicXML Playeru je vydán pod licencí MIT.

Přiložené knihovny třetích stran mají vlastní licence. Podrobnosti jsou v `THIRD-PARTY-NOTICES.md`.

## Stav projektu

Projekt je funkční a může se dále rozšiřovat.

Vznikal postupně při praktickém testování různých MusicXML skladeb a řešení problémů spojených s časováním, vícehlasem, dynamikou a synchronizací notového zápisu s přehráváním.
