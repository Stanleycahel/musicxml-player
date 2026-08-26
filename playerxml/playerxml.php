<?php
if (!isset($musicxml)) {
    $musicxml = "";
}

$base = rtrim(dirname($_SERVER["SCRIPT_NAME"]), "/\\");
$playerPath = $base . "/playerxml";
?>

<div id="playerxml">

<div id="playerToolbar">

    <div class="toolbarGroup">

        <button id="btnHome" title="Na začátek">⏮</button>

        <button id="btnPlayPause" title="Přehrát / Pauza">▶</button>

        <button id="btnLoop" title="Smyčka">🔁</button>
       <span id="loopRange" style="display:inline-block; margin-left:8px; color:#333; font-weight:bold;">--/--</span>

    </div>
    <div id="loopDialog" style="display:none;">

    <div id="loopDialogTitle" style="color:#000; ">
        Zadej začátek smyčky.
    </div>

    <input
        id="loopMeasureInput"
        type="number"
        min="1"
        placeholder="Číslo taktu"
    >

    <button id="loopDialogOk">OK</button>

</div>

    <div class="toolbarGroup">

        <span class="toolbarLabel">Tempo</span>

        <button id="tempoDown" title="Tempo lze upravit před spuštěním play">−</button>

        <span id="tempoValue">100 %</span>

        <button id="tempoUp" title="Tempo lze upravit před spuštěním play">+</button>

    </div>

    <div class="toolbarSpacer"></div>

    <div id="spessaStatus">
        ● Připraveno
    </div>

    <button id="btnFullscreen" title="Celá obrazovka">⛶</button>

</div>

    <div id="scoreContainer">
    <div id="score"></div>
</div>

</div>

<style>

/*#playerxml{
    width:100%;
    margin:20px auto;
    font-family:Arial,sans-serif;
}*/



#playerxml{

    width:100%;

    margin:10px auto 20px auto;

    font-family:Arial,sans-serif;

    display:flex;

    flex-direction:column;

    height:min(632px, calc(100vh - 180px));

    overflow:hidden;

}




#playerToolbar{

    position:sticky;
    top:0;
    z-index:1000;

    display:flex;
    align-items:center;
    gap:18px;

    padding:10px 14px;

    background:#f7f7f7;

    /* bez rámečku */
    border:none;

    /* jen jemný stín */
    box-shadow:0 2px 10px rgba(0,0,0,.12);

    border-radius:8px 8px 0 0;
}

#scoreContainer {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: white;
    border: 1px solid #d5d5d5; 
    border-top: none;
    border-radius: 0 0 8px 8px;
}

#score {
    padding: 10px 0;
    background: white;
}

.toolbarGroup{

    display:flex;

    align-items:center;

    gap:8px;

}

.toolbarSpacer{

    flex:1;

}

.toolbarLabel{

    font-weight:bold;

    color:#555;

}

#playerToolbar button{

    width:42px;

    height:42px;

    font-size:20px;

    cursor:pointer;

    border:1px solid #bdbdbd;

    border-radius:6px;

    background:white;

    transition:background .2s;

}

#playerToolbar button:hover{

    background:#e9f2ff;

}

#tempoValue{

    min-width:70px;

    text-align:center;

    font-weight:bold;
    
    color:#333;

}

#spessaStatus{

    font-weight:bold;

    color:#0b7d32;

    white-space:nowrap;

}






#score{

    border:1px solid #bbb;

    background:white;

    padding:20px;

    overflow:auto;

} 
#score svg {
    max-width: 100%;
    height: auto;
    display: block;
}

</style>

<script>
window.PlayerXML = {

    musicxml: <?= json_encode($musicxml, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>,

    vendorPath: <?= json_encode($playerPath . "/vendor", JSON_UNESCAPED_SLASHES) ?>

};
</script>

<script src="<?= $playerPath ?>/vendor/opensheetmusicdisplay.min.js"></script>

<script type="module"
src="<?= $playerPath ?>/player.js?v=<?= filemtime(__DIR__ . '/player.js') ?>">
</script>
