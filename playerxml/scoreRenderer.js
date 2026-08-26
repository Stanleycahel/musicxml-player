export default class ScoreRenderer {

    constructor(divId) {
          

        this.container = document.getElementById(divId);

        this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(
            this.container,
            {
                autoResize: false,
                backend: "svg",
                drawTitle: true,
                drawSubtitle: true,
                drawComposer: true
            }
        );
        console.log("scorerender verze 15.1");
       // console.log(this.osmd);
       this.measureMap = [];

        this.measureHighlights = [];
        this.currentHighlight = -1;
        this.onMeasureClicked = null;
    }


    async load(xmlFile) {

        await this.osmd.load(xmlFile);
        this.osmd.Zoom = 0.65;   //nastavit zobrazení velikosti not


        this.osmd.render();
        this.buildMeasureMap();
        
        
        this.createMeasureHighlights();

      //  console.log("? Notový zápis vykreslen");
    }
    
   buildMeasureMap() {

    this.measureMap = [];

    const measures = new Map();

    // seskupení všech grafických taktů podle čísla taktu
    this.osmd.graphic.measureList.forEach(system => {

        system.forEach(graphicalMeasure => {

            const number = graphicalMeasure.measureNumber;

            if (!measures.has(number)) {

                measures.set(number, []);

            }

            measures.get(number).push(graphicalMeasure);

        });

    });

    // vytvoření jednoho záznamu pro každý takt
    measures.forEach((graphicalMeasures, measureNumber) => {

        const first = graphicalMeasures[0];

        this.measureMap.push({

            osmdIndex: this.measureMap.length,

            tickStart: null,

            measureNumber: measureNumber,

            xmlNumber: first.parentSourceMeasure.MeasureNumberXML,

            internalNumber: first.parentSourceMeasure.measureNumber,

            implicit: first.parentSourceMeasure.implicitMeasure,

            graphicalMeasures: graphicalMeasures

        });

    });

   // console.table(this.measureMap);

}

setMeasureStarts(measureStarts) {

    for (let i = 0; i < this.measureMap.length && i < measureStarts.length; i++) {

        this.measureMap[i].tickStart = measureStarts[i].tickStart;

    }

   // console.table(this.measureMap);

}
highlightTick(tick) {

    let index = -1;

    for (let i = 0; i < this.measureMap.length; i++) {

        if (this.measureMap[i].tickStart <= tick) {

            index = i;

        } else {

            break;

        }

    }

    if (index === -1) {
        return;
    }

    this.highlightMeasure(
        this.measureMap[index].measureNumber
    );

}


createMeasureHighlights() {

    const svg = this.container.querySelector("svg");

    if (!svg) {
        return;
    }

    this.measureHighlights = [];

    
 // kliknutí na takt
if (this.measureClickHandler) {

    svg.removeEventListener(
        "click",
        this.measureClickHandler
    );

}

this.measureClickHandler = (e) => {

    const measure = e.target.closest("g.vf-measure");

    if (!measure) {
        return;
    }

    const measureNumber = parseInt(measure.id);

    console.log("KLIK TAKT:", measureNumber);

    if (this.onMeasureClicked) {
        this.onMeasureClicked(measureNumber);
    }

};

svg.addEventListener(
    "click",
    this.measureClickHandler
);

// ---------- klikací vrstva pro celý takt ----------

const clickMeasures = svg.querySelectorAll("g.vf-measure");

clickMeasures.forEach(measure => {

    const box = measure.getBBox();

    const clickRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
    );

    clickRect.setAttribute("x", box.x);
    clickRect.setAttribute("y", box.y);
    clickRect.setAttribute("width", box.width);
    clickRect.setAttribute("height", box.height);

    clickRect.setAttribute("fill", "rgba(180,200,240,0.00)");

    clickRect.style.pointerEvents = "all";
    clickRect.style.cursor = "pointer";

    measure.insertBefore(clickRect, measure.firstChild);

});

    // ---------- seskupení všech osnov podle čísla taktu ----------

    const measures = new Map();

    this.osmd.graphic.measureList.forEach(system => {

        system.forEach(graphicalMeasure => {

            const number = graphicalMeasure.measureNumber;

            if (!measures.has(number)) {
                measures.set(number, []);
            }

            measures.get(number).push(graphicalMeasure);
            


        });

    });

    // ---------- vytvoření jednoho obdélníku pro každý takt ----------

    measures.forEach((graphicalMeasures, measureNumber) => {

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        graphicalMeasures.forEach(gm => {

            const stave = gm.stave;

            if (!stave) {
                return;
            }

            minX = Math.min(minX, stave.x);
            minY = Math.min(minY, stave.y);

            maxX = Math.max(maxX, stave.x + stave.width);
            maxY = Math.max(maxY, stave.y + stave.height);

        });

        const rect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
        );

        rect.setAttribute("x", minX);
        rect.setAttribute("y", minY);
        rect.setAttribute("width", maxX - minX);
        rect.setAttribute("height", maxY - minY);

        rect.setAttribute("fill", "#b4c8f0");
        rect.setAttribute("fill-opacity", "0.20");

        rect.style.display = "none";
        rect.style.pointerEvents = "none";

        svg.insertBefore(rect, svg.firstChild);

        this.measureHighlights[measureNumber] = [rect];
        

    });

}

highlightMeasure(measureNumber) {

    // schovej předchozí zvýraznění
    if (this.currentHighlight !== -1) {

        const previousRects =
            this.measureHighlights[this.currentHighlight];

        if (previousRects) {

            for (const rect of previousRects) {

                rect.setAttribute(
                    "fill",
                    "rgba(180,200,240,0.00)"
                );

            }

        }

    }

    // zapamatuj si nový takt
    this.currentHighlight = measureNumber;

    // zobraz nový takt  --  zvýraznění aktivního taktu
    const currentRects =
        this.measureHighlights[measureNumber];

    if (currentRects) {

        for (const rect of currentRects) {

            rect.style.display = "";
            rect.setAttribute("fill", "#00FF99");   //barva zvýraznění   #b4c8f0
            rect.setAttribute("fill-opacity", "0.15"); //průhlednost zvýraznění

        }

    }

    this.scrollToMeasure(measureNumber);

}

clearHighlight() {

    if (this.currentHighlight > 0) {

        const rects = this.measureHighlights[this.currentHighlight];

        if (rects) {

            for (const rect of rects) {

                rect.style.display = "none";

            }

        }

    }

    this.currentHighlight = -1;

  }

scrollToMeasure(measureNumber) { //posun během přehrávání

    const rects = this.measureHighlights[measureNumber];

    if (!rects || rects.length === 0) {
        return;
    }

    const rect = rects[0];

    const scoreContainer = document.getElementById("scoreContainer");

    if (!scoreContainer) {
        return;
    }

    const rectBox = rect.getBoundingClientRect();
    const containerBox = scoreContainer.getBoundingClientRect();

    const targetY =
        scoreContainer.scrollTop +
        (rectBox.top - containerBox.top) -
        65;           //px odsazení od ovládací lišty

    scoreContainer.scrollTo({
        top: targetY,
        behavior: "smooth"
    });
   }

   async refreshAfterResize(measureStarts = null) {

    // Zapamatujeme si právě zvýrazněný takt
    const oldHighlight = this.currentHighlight;

    console.log(
        "FULLSCREEN RESIZE – obnovuji partituru, takt:",
        oldHighlight
    );

    // OSMD překreslí partituru podle nové velikosti
    this.osmd.render();

    // Znovu vytvoříme mapu taktů
    this.buildMeasureMap();

    // Znovu vytvoříme klikací vrstvy
    // a zvýrazňovací obdélníky
    this.createMeasureHighlights();

    // Obnovíme začátky taktů
    if (measureStarts) {
        this.setMeasureStarts(measureStarts);
    }

    // createMeasureHighlights() vytvořil nové obdélníky,
    // proto znovu nastavíme stav zvýraznění.
    this.currentHighlight = -1;

    if (oldHighlight !== -1) {

        this.highlightMeasure(oldHighlight);

    }

}

}
