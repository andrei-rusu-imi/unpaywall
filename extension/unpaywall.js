var devMode = true;


if (chrome){
    browser = chrome
}

// global variables:
var iframe = document.createElement('iframe');
var results = {
    pdfScrape: {
        url: undefined,
        isComplete: false,
        color: undefined
    },
    oadoi: {
        url: undefined,
        isComplete: false,
        color: undefined
    }
}
var iframeIsInserted = false
var settings = {}
var myHost = window.location.hostname







var devLog = function(str, obj){
    if (devMode){
        console.log("unpaywall: " + str, obj)
    }
}
devLog("unpaywall is running")


// most scholarly articles have some kind of DOI meta
// tag in the head of the document. Check these.
function findDoiFromMetaTags(){
    var doi

    // collection of the various ways different publishers may
    // indicate a given meta tag has the DOI.
    var doiMetaNames = [
        "citation_doi",
        "doi",
        "dc.doi",
        "dc.identifier",
        "dc.identifier.doi",
        "bepress_citation_doi",
        "rft_id",
        "dcsext.wt_doi"
    ];

    $("meta").each(function(i, myMeta){
        if (!myMeta.name){
            return true // keep iterating
        }

        // has to be a meta name likely to contain a DOI
        if (doiMetaNames.indexOf(myMeta.name.toLowerCase()) < 0) {
            return true // continue iterating
        }

        // content has to look like a  DOI.
        // much room for improvement here.
        var doiCandidate = myMeta.content.replace("doi:", "").trim()
        if (doiCandidate.indexOf("10.") === 0) {
            doi = doiCandidate
        }
    })

    if (doi){
        devLog("found a DOI from a meta tag")
        return doi
    }
}

// sniff DOIs from the altmetric.com widget and CrossMark widget.
function findDoiFromDataDoiAttributes(){

    var dataDoiValues =  $("*[data-doi]").map(function(){
        return this.getAttribute("data-doi")
    }).get()


    // if there are multiple unique DOIs, we're on some kind of TOC page,
    // we don't want none of that noise.
    var numUniqueDois = new Set(dataDoiValues).size
    if (numUniqueDois === 1){
        devLog("found a DOI from a [data-doi] attribute")
        return dataDoiValues[0]
    }
}

// ScienceDirect has their own wacky format where the DOI is only
// defined in a JS variable. There are lots of ScienceDirect articles,
// so handle these specially.
// eg: http://www.sciencedirect.com/science/article/pii/S1751157709000881
function findDoiFromScienceDirect() {
    var docAsStr = document.documentElement.innerHTML;

    var scienceDirectRegex = /SDM.doi\s*=\s*'([^']+)'/;
    var m = scienceDirectRegex.exec(docAsStr)
    if (m && m.length > 1){
        devLog("found a DOI from ScienceDirect JS variable", m[1])
        return m[1]
    }
}


function findDoi(){
    // we try each of these functions, in order, to get a DOI from the page.
    var doiFinderFunctions = [
        findDoiFromMetaTags,
        findDoiFromScienceDirect,
        findDoiFromDataDoiAttributes
    ]

    for (var i=0; i < doiFinderFunctions.length; i++){
        var myDoi = doiFinderFunctions[i]()
        if (myDoi){
            // if we find a good DOI, stop looking
            return myDoi
        }
    }
}



function findPdfUrl(){

    // todo massively improve PDF link detection.
    // step one: bring in all the code from
    // https://github.com/Impactstory/articlepage/blob/master/article_page.py
    // as this is well tested and gets oodles of instances.
    //
    // step two is bring in code from zotero translators
    //
    // for now though this will get enough to be interesting, as the <meta>
    // approach is the most common one from publishers.

    var pdfUrl;


    //  look in the <meta> tags
    // same thing, but look in  <link> tags
    $("meta").each(function(i, elem){
        if (elem.name == "citation_pdf_url") {
            pdfUrl = elem.content
            return false; // stop iterating, we found what we need
        }
    })

    // todo look in <link> tags as well


    // look in the markup itself. most of these will be pretty narrowly scoped
    // to a particular publisher.

    var $links = $("a")
    $links.each(function(i, link){
        var $link = $(link)

        // http://www.nature.com/nature/journal/v536/n7617/full/nature19106.html
        if (/\/nature\/journal(.+?)\.pdf$/.test(link.href)) {
            pdfUrl = link.href
            return false
        }

        // http://www.nature.com/articles/nmicrobiol201648
        if (/\/articles\/nmicrobiol\d+\.pdf$/.test(link.href)) {
            pdfUrl = link.href
            return false
        }

        // NEJM
        // open: http://www.nejm.org/doi/10.1056/NEJMc1514294
        // closed: http://www.nejm.org/doi/full/10.1056/NEJMoa1608368
        if (link.getAttribute("data-download-content") == "Article") {
            pdfUrl = link.href
            return false
        }

        // Taylor & Francis Online
        if (myHost == "www.tandfonline.com") {
            // open: http://www.tandfonline.com/doi/full/10.1080/00031305.2016.1154108
            // closed: http://www.tandfonline.com/doi/abs/10.1198/tas.2011.11160
            if (/\/doi\/pdf\/10(.+?)needAccess=true$/i.test(link.href)){
                pdfUrl = link.href
                return false
            }
        }

        //  The Journal of Clinical Endocrinology & Metabolism
        if (myHost == "http://press.endocrine.org/") {
            // not sure if we should handle this one or not. it's on an old version of
            // their website

        }

        // Centers for Disease Control
        if (myHost == "www.cdc.gov") {
            // open https://www.cdc.gov/mmwr/volumes/65/rr/rr6501e1.htm
            if (link.classList[0] == "noDecoration" && /\.pdf$/.test(link.href)){
                pdfUrl = link.href
                return false
            }

        }



    })



    return pdfUrl
}


function insertIframe(name){

    // make sure we are not inserting iframe again and again
    if (iframeIsInserted){
        return false
    }

    devLog("inserting iframe, based on these results:", results)
    iframe.src = browser.extension.getURL('unpaywall.html');

    iframe.style.height = "50px";
    iframe.style.width = '50px';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.top = '33%';
    iframe.scrolling = 'no';
    iframe.style.border = '0';
    iframe.style.zIndex = '9999999999';
    iframe.style.display = 'none;'
    iframe.id = "unpaywall";

    // set a custom name
    iframe.name = name

    document.documentElement.appendChild(iframe);
    iframeIsInserted = true
}

//function postSuccessMsg(msg){
//    iframe.contentWindow.postMessage({
//        unpaywall: "success"
//    }, "*")
//}





function doPdfScrape(){
    var pdfUrl = findPdfUrl()
    if (!pdfUrl){
        results.pdfScrape.isComplete = true
        return false
    }

    devLog("doing PDF scrape on this URL", pdfUrl)

    // ok, we've got a PDF URL. Let's see if it's open.

    var xhr = new XMLHttpRequest()
    xhr.open("GET", pdfUrl, true)
    xhr.onprogress = function () {
        //devLog("HEADERS:", xhr.getAllResponseHeaders())
        var contentType = xhr.getResponseHeader("Content-Type")

        if (contentType){
            results.pdfScrape.isComplete = true
            xhr.abort()

            if (contentType.indexOf("pdf") > -1){
                results.pdfScrape.url = pdfUrl
                results.pdfScrape.color = "gold"
            }
        }
    }

    // so it's important to mark this done even if something goes wrong,
    // or we'll never make a decision to show the Green OA tab even if we find green. Eg:
    // https://link.springer.com/article/10.1023%2FB%3AMACH.0000011805.60520.fe
    // redirects to http download server, which throws error (needs to be https).
    xhr.onerror = function(){
        results.pdfScrape.isComplete = true
    }
    xhr.send()
}

function doOadoi(){
    var doi = findDoi()
    var url = "https://api.oadoi.org/" + doi + "?email=unpaywall@impactstory.org"
    devLog("doing oaDOI check", url)


    $.getJSON(url, function(data){
        results.oadoi.isComplete = true
        devLog("oaDOI returned", data)
        var resp = data.results[0]
        if (resp.oa_color){
            results.oadoi.color = resp.oa_color  // green or gold
            results.oadoi.url = resp.free_fulltext_url
        }
    })

}

function resolvesToCurrentHost(url){
    var currentUrl = new URL(window.location)
    var oadoiUrl = new URL(url)
    return currentUrl.hostname === oadoiUrl.hostname
}


function decideTabColor(){
    //devLog("checking results....", results)


    // if all the results aren't in, we can't make decisions. quit.
    if (!(results.pdfScrape.isComplete && results.oadoi.isComplete)){
        return
    }

    // if the settings aren't loaded, quit
    if (typeof settings.showOaColor == "undefined") {
        return
    }


    // the decision on how to assign tab color is a bit complicated.
    // it's layed out below as a set of steps, arranged in order of preference.
    // if we get a hit on any step, we select a color and then quit.
    var color

    // 1. if it's gold OA, we want to make sure we show that, so it's at the top
    if (results.oadoi.color == "gold") {
        color = "gold"
    }


    // 2. if we scraped a PDF from this page, it may be that the user is browsing
    // from campus/VPN and they have lib-purchased access,
    // or it may be a hybrid article that OA didn't realize was gold. either way
    // it's more likely to please the user than the Green OA copy, so we send it.
    else if (results.pdfScrape.url){
        color = "blue"
    }

    // 3. green
    else if (results.oadoi.color == "green") {
        color = "green"
    }

    // alas, we couldn't find any OA for this. but we want to show a tab anyway, because
    // that way the user knows the extension is actually there and working.
    // this could get annoying, but is requested by beta testers now.
    // in future, we could control with a config.
    else {
        color = "black"
    }





    // @todo
    // we need to hide the tab if it's on the green oa page already.
    // use  resolvesToCurrentHost(results.oadoi.url)




    // ok now we need to decide what color to return, based on
    // the users-selected showOaColor setting

    // if the user likes to dive into the nerdy details of what kind of OA is what,
    // great, let's show em what we found.
    if (settings.showOaColor){
        return color
    }

    // but for most users, they just want to know if they can read it. for them,
    // Green Means Go.
    else {
        if (color != "black") {
            return "green"
        }
        else {
            return "black"
        }
    }

}

function goToFulltext(){
    var newLoc

    if (results.pdfScrape.url){
        newLoc = results.pdfScrape.url
    }
    else if (results.oadoi.url){
        newLoc = results.oadoi.url
    }
    else {
        alert("The Unpaywall extension " +
            "couldn't find any legal open-access version of this article.");
    }

    if (newLoc){
        devLog("sending user to new fulltext URL: " + newLoc, results)
        window.location = newLoc
    }
}

function reportInstallation(){
    // this is so the unpaywall.org/welcome page knows that this user
    // has actually installed the extension.
    var loc = window.location.host
    if (loc.indexOf("unpaywall.org") === 0){
        devLog("installed. adding reporting div.")
        $("<div style='display:none' id='unpaywall-is-installed'></div>")
            .appendTo("body")
    }
}

function loadSettings(){
    browser.storage.local.get({
        showOaColor: false
    }, function(items) {
        devLog("retrieved settings", items)
        settings.showOaColor = items.showOaColor;
    });
}





function run() {
    reportInstallation()
    var doi = findDoi()

    // the meat of the extension does not run unless we find a DOI
    if (!doi){
        return
    }

    devLog("we have a doi!", doi)

    // these run in parallel:
    loadSettings()
    doOadoi()
    doPdfScrape()

    // poll, waiting for all our data to be collected. once it is,
    // make a call and inject the iframe, then quit.
    var resultsChecker = setInterval(function(){
        devLog("checking results...")
        var tabColor = decideTabColor()
        if (tabColor){
            insertIframe(tabColor)
            clearInterval(resultsChecker) // stop polling
        }
    }, 250)


    // we can't tell when someone clicks on the iframe,
    // so we have to listen to message sent from it.
    window.addEventListener("message", function(msg){
        if (msg.data.unpaywall == "go-to-pdf"){
            goToFulltext()
        }
    }, false);

}


// on firefox, jquery sometimes loads after this script. give it
// some time to load before we run anything on this page.
setTimeout(run, 200)

















