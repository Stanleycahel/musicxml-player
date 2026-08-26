export default class MusicXMLLoader {

    static async load(url) {

        console.log("Načítám MusicXML:", url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Nelze načíst MusicXML (${response.status})`);
        }

        const xmlText = await response.text();

        console.log("Velikost XML:", xmlText.length);

        const parser = new DOMParser();

        const xml = parser.parseFromString(xmlText, "application/xml");

        const error = xml.querySelector("parsererror");

        if (error) {
            throw new Error("Chyba při parsování MusicXML");
        }

        console.log("MusicXML načteno");

        return xml;
    }

}
