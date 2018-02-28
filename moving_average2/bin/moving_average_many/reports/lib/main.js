"use strict";

// disable JSHint warning: Use the function form of "use strict".
// This warning is meant to prevent problems when concatenating scripts that
// aren't strict, but we shouldn't have any of those anyway.
/* jshint -W097 */

/// Global variables

// map< fileinfo.index, position of fileinfo in fileInfos array (which is
// the same as the tab index)>
// i.e. map< file index, tab index >
var tabIndexMap = {};
var FLOWS = {
    NONE:   0,
    OPENCL: 1,
    HLS:    2,
    BOTH:   3
    };
var VIEWS = {
    NONE:        { value: 0, name: "",                         hash: "",       flow: FLOWS.NONE},
    SUMMARY:     { value: 1, name: "Summary",                  hash: "#view1", flow: FLOWS.BOTH},
    OPT:         { value: 2, name: "Loops analysis",           hash: "#view2", flow: FLOWS.BOTH},
    AREA_SYS:    { value: 3, name: "Area analysis of system",  hash: "#view3", flow: FLOWS.BOTH},
    AREA_SRC:    { value: 4, name: "Area analysis of source",  hash: "#view4", flow: FLOWS.BOTH},
    SPV:         { value: 5, name: "System viewer",            hash: "#view5", flow: FLOWS.OPENCL},
    CSPV:        { value: 5, name: "Component viewer",         hash: "#view5", flow: FLOWS.HLS},
    LMEM:        { value: 6, name: "memory viewer",            hash: "#view6", flow: FLOWS.BOTH},
    VERIF:       { value: 7, name: "Verification statistics",  hash: "#view7", flow: FLOWS.HLS}
    };
var viewHash = []; // initialized in main::initializeViews()

// vector< fileInfo objects >
var fileInfos;
var detailValues = [""];
var detailIndex = 1;
var curFile;
var spv_graph;
var lmem_graph;
var cspv_graph;
var detailOptValues = [];

var spv;
var sideCollapsed = false;
var detailCollapsed = false;
var view = VIEWS.SUMMARY;
var flow = FLOWS.BOTH;
var currentPane = null;
var mavData = null;
var lmvData = null;

var LOOP_ANALYSIS_NAME = VIEWS.OPT.name + "<span style='float:right'><input id='showFullyUnrolled' type='checkbox' checked='checked' value='Fully unrolled loops'>&nbspShow fully unrolled loops&nbsp</span>";
var REPORT_PANE_HTML = "<div class='classWithPad' id='opt-area-panel'><div class='panel panel-default' id='report-panel-body'><div class='panel-heading'>";
var NO_SOURCE = "No Source Line";

var isValidLoopAnalysis = true;
var isValidVerifAnalysis = true;
var isValidAreaReport   = true;
var isValidSystemViewer = true;
var isValidMemoryViewer = true;
var isValidFileList     = true;
var isValidSummary      = true;
var isValidWarnings     = true;
var isValidInfo         = true;


function
main()
{
    var activeKernel = 0;

    // check if all information is valid
    isValidLoopAnalysis  = (typeof loopsJSON   != "undefined") && (loopsJSON   = tryParseJSON(loopsJSON))   !== null;
    isValidVerifAnalysis = (typeof verifJSON   != "undefined") && (verifJSON   = tryParseJSON(verifJSON))   !== null;
    isValidAreaReport    = (typeof areaJSON    != "undefined") && (areaJSON    = tryParseJSON(areaJSON))    !== null;
    isValidSystemViewer  = (typeof mavJSON     != "undefined") && (mavJSON     = tryParseJSON(mavJSON))     !== null;
    isValidFileList      = (typeof fileJSON    != "undefined") && (fileJSON    = tryParseJSON(fileJSON))    !== null;
    isValidSummary       = (typeof summaryJSON != "undefined") && (summaryJSON = tryParseJSON(summaryJSON)) !== null;
    isValidWarnings      = (typeof warningsJSON!= "undefined") && (warningsJSON= tryParseJSON(warningsJSON))!== null;
    isValidInfo          = (typeof infoJSON    != "undefined") && (infoJSON    = tryParseJSON(infoJSON))    !== null;
    isValidMemoryViewer  = (typeof lmvJSON     != "undefined") && (lmvJSON     = tryParseJSON(lmvJSON))     !== null;

    mavData = mavJSON;
    lmvData = lmvJSON;

    // Set page title
    var pageTitle = "HLD Report";
    if (isValidInfo && infoJSON.hasOwnProperty('rows')) {
        for (var r in infoJSON.rows) {
            if (infoJSON.rows[r].hasOwnProperty('name')) {
                if (infoJSON.rows[r].name === "Project Name") {
                    pageTitle += ": " + infoJSON.rows[r].data;
                } else if (infoJSON.rows[r].name.indexOf("i++") >= 0) {
                    flow = FLOWS.HLS;
                } else if (infoJSON.rows[r].name.indexOf("AOC") >= 0) {
                    flow = FLOWS.OPENCL;
                }
            }
        }
    }
    $('#titleText').html(pageTitle);

    // remove unused/invalid views
    for (var v in VIEWS) {
        if (VIEWS[v].flow != FLOWS.BOTH && VIEWS[v].flow != flow) {
            delete VIEWS[v];
        } else {
            // add clickDown and source fields
            VIEWS[v].clickDown = null;
            VIEWS[v].source = null;

            // Prepend 'Kernel' or 'Component' for memory viewer (view 7)
            if (VIEWS[v] == VIEWS.LMEM) {
                VIEWS[v].name = ((flow == FLOWS.OPENCL) ? "Kernel" : "Component") + " memory viewer";
            }
        }
    }

    if (isValidFileList) {
      if (mavData && lmvData) {
        // Check if mavData.fileIndexMap and lmvData.fileIndexMap have the same content
        // Check same number of elements
        warn( Object.keys(mavData.fileIndexMap).length == Object.keys(lmvData.fileIndexMap).length, "The number of paths in lmvJSON and mavJSON are different!" );
        // Check value for each key is the same
        Object.keys(mavData.fileIndexMap).forEach(function (path) {
              warn( mavData.fileIndexMap[path] == lmvData.fileIndexMap[ path ], "fileIndexMap for path " + path + " in mavJSON and lmvJSON are different!" );
          });
      }

      // map < file name, file index > (The map used by the compiler)
      var fileIndexMap = mavData ? mavData.fileIndexMap : lmvData ? lmvData.fileIndexMap : null;
      // 1. Gather file names and content in one structure

      if (fileIndexMap) {
        fileInfos = parseFileInfos();
        tabIndexMap = createTabIndexMap( fileInfos );
      } else {
        isValidFileList = false;
      }
    }

    // Get area and optimization report
    if (VIEWS.AREA_SYS || VIEWS.AREA_SRC) {
        if (isValidAreaReport) {
            parseAreaTables();
        } else {
            VIEWS.AREA_SYS.source = "&nbspArea report data is invalid!";
            VIEWS.AREA_SRC.source = "&nbspArea report data is invalid!";
        }
    }

    if (VIEWS.SUMMARY) {
        if (isValidSummary || isValidInfo) {
            VIEWS.SUMMARY.source = parseSummaryData();
        } else {
            VIEWS.SUMMARY.source = "&nbspSummary data is invalid!";
        }
    }

    if (VIEWS.OPT) {
        if (isValidLoopAnalysis) {
            VIEWS.OPT.source = parseLoopTable(loopsJSON, true);
        } else {
            VIEWS.OPT.source = "&nbspLoop analysis data is invalid!";
        }
    }

    if (VIEWS.VERIF) {
        if (isValidVerifAnalysis) {
            VIEWS.VERIF.source = parseLoopTable(verifJSON, false);
        } else {
            VIEWS.VERIF.source = "&nbspVerification analysis data is unavailable!\n";
            VIEWS.VERIF.source += "Run the verification testbench to generate this information.";
        }
    }

    initializeViews();

    if (isValidFileList) {
      // 3. For each source file, add a tab in the editor pane
      addFileTabs( fileInfos );

      // 4. Add file contents
      addFileContents( fileInfos );

      // 5. Add onclick functions to report tabs (they're already statically added
      // in index.html)
      addReportTabs();

      adjustToWindowEvent();

      verifyThings();
    } else {
      $('#editor-pane'). toggle();
      $('#report-pane').css('width', '100%');
      sideCollapsed = true;
      adjustToWindowEvent();
    }

    ///// Functions

    /// main::tryParseJSON
    function
    tryParseJSON(json)
    {
        var valid = !$.isEmptyObject(json);
        if (valid) {
            if (typeof json !== "string") {
                // If we've gotten to this point, this is already a valid Javascript object.
                return json;
            }
            try {
                return JSON.parse(json);
            } catch(e) {
                console.log(e);
                return null;
            }
        } else {
            return null;
        }
    }

    function
    parseSummaryData()
    {
        var summaryInfo = "";

        if (isValidInfo) {
            summaryInfo += myParseTable(infoJSON);
        }

        if (isValidSummary) {
            if (summaryJSON.hasOwnProperty('performanceSummary')) {
                summaryInfo += myParseTable(summaryJSON.performanceSummary);
            }

            if (summaryJSON.hasOwnProperty('estimatedResources')) {
                summaryInfo += myParseTable(summaryJSON.estimatedResources);
            }

            if (summaryJSON.hasOwnProperty('compileWarnings')) {
                if (isValidWarnings) {
                    for (var r in warningsJSON.rows) {
                        try {
                            summaryJSON.compileWarnings.rows.push(warningsJSON.rows[r]);
                        } catch(e) {
                            console.log(e);
                        }
                    }
                }
                if (summaryJSON.compileWarnings.rows.length < 1) {
                  summaryJSON.compileWarnings.rows.push({"name":"None"});
                }
                summaryInfo += myParseTable(summaryJSON.compileWarnings);
            }
        } else {
            summaryInfo += "&nbsp;Summary data is invalid!";
        }
        return summaryInfo;
    }

    function myParseTable(o) {
        var t = "<table class='table table-hover'>";
        var precision = 0;
        var hasDetailsCol = false;

        // title
        if (o.hasOwnProperty('name')) {
            t += "<text><b>&nbsp;" + o.name + "</b></text>";
        }

        // get precision for floats
        if (o.hasOwnProperty('precision')) {
            precision = o.precision;
        }

        if (o.hasOwnProperty("sticky_title")) {
        }

        // table header
        if (o.hasOwnProperty("columns")) {
            // details column?
            if (o.columns.indexOf("Details") > -1) {
                hasDetailsCol = true;
            }
            if (o.hasOwnProperty("sticky_title")) {
                t += "<thead><tr class='res-heading-row' data-ar-vis=0 data-level=0 id='table-header'>";
            } else {
                t += "<tbody><tr class=\"nohover\" index=0>";
            }
            for (var name in o.columns) {
                if (o.hasOwnProperty("sticky_title")) {
                    t += "<th>" + o.columns[name] + "</th>";
                } else {
                    t += "<td><b>" + o.columns[name] + "</b></td>";
                }
            }
            t += "</tr>";
            if (o.hasOwnProperty("sticky_title")) {
              t += "</thead><tbody>";
              // create spacer row
              t += "<tr data-level=0 id=first-row>";
              o.columns.forEach(function (h) {
                  t += "<td>" + h + "</td>";
                  });
              t += "</tr>";
            }
        }

        // table rows
        for (var row in o.rows) {
          t += myAddRow(o.rows[row], 0);
        }

        t += "</tbody></table>";
        return t;

        //// functions

        function myAddRow(row, level) {
            var indent = 12;
            var r = "";
            // start row
            r += "<tr";

            // Add special classes
            var row_clickable = true;
            if (row.hasOwnProperty("classes")) {
              r += " class=\"";
              row.classes.forEach(function(c) {
                    r += " " + c;
                    if (c == "summary-highlight") {
                      row_clickable = false;
                    }
                  });
              r += "\"";
            }

            // deal with details
            if (row.hasOwnProperty("details")) {
                r += myParseDetails(row);
            } else {
                r += " index=0";
                if (row_clickable) {
                  r += " clickable='1'";
                }
            }

            // deal with debug info
            if (row.hasOwnProperty('debug') && row.debug[0][0].line !== 0) {
                r += " onClick='syncEditorPaneToLine(" + row.debug[0][0].line;
                r += ", \"" + getFilename(row.debug[0][0].filename) + "\")'";
            }

            // end row start
            r += ">";

            // Add row title if it exists
            if (row.hasOwnProperty("name")) {
                r += "<td style='text-indent:" + level*indent + "px'>";
                r += row.name + "</td>";
            }

            // Add row data
            for (var d in row.data) {
                var data = row.data[d];
                if (isFloat(data)) {
                    var p;
                    if (precision instanceof Array) {
                        p = precision[d];
                    } else {
                        p = precision;
                    }
                    data = data.toFixed(p);
                }
                if (row.hasOwnProperty("data_percent")) {
                  if (row.data_percent.length > d) {
                    data += " (" + row.data_percent[d].toFixed(0) + "%)";
                  }
                }
                r += "<td>" + data + "</td>";
            }

            // add details column?
            if (hasDetailsCol) {
              if (row.hasOwnProperty("details")) {
                r += "<td>" + row.details[0] + "</td>";
              } else {
                r += "<td></td>";
              }
            }

            // end row
            r += "</tr>";

            // add sub-rows if they exist
            if (row.hasOwnProperty("subrows")) {
              for (var sr in row.subrows) {
                r += myAddRow(row.subrows[sr], level + 1);
              }
            }

            return r;
        } // myParseTable::myAddRow()

        function myParseDetails(row) {
            var d = "";

            // details section
            if (row.resources !== undefined && row.resources.length > 0) {
                d += "<ul class='details-list'>";
                if (row.hasOwnProperty("name")) {
                    d += "<b>" + row.name + ":</b><br>";
                }
                for (var ri = 0; ri < row.resources.length; ri++) {
                    d += row.resources[ri].name + "<br>";
                    if (row.resources[ri].subinfos === undefined) {
                        continue;
                    }
                    d += "<ul>";
                    var subinfos = row.resources[ri].subinfos;
                    for (var i = 0; i < subinfos.length; i++) {
                        if (subinfos[i].info.debug !== undefined && subinfos[i].info.debug[0].length > 0) {
                            var infoFilename = getFilename(subinfos[i].info.debug[0][0].filename);
                            var infoLine = subinfos[i].info.debug[0][0].line;
                            //var infoNodeId = subinfos[i].info.debug[0][0].nodeId;  //Feature in 17.1 Add node ID to debug info
                            d += "<li>" + subinfos[i].info.name + " (";
                            d += "<a style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoFilename + ":" + infoLine + "</a>";

                            // there can be multiple debug location, i.e. LSU merge
                            for (var di = 1; di < subinfos[i].info.debug[0].length; di++) {
                                infoLine = subinfos[i].info.debug[0][di].line;
                                if (infoFilename != getFilename(subinfos[i].info.debug[0][di].filename)) {
                                    infoFilename = getFilename(subinfos[i].info.debug[0][di].filename);
                                    d += ", <p style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoFilename + ":" + infoLine + "</p>";
                                }
                                else {
                                    d += ", <a style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoLine + "</a>";
                                }
                            }
                            d += ")";
                        } else {
                            d += "<li>" + subinfos[i].info.name + " (Unknown location)";
                        }
                        d += "</li>";
                    }
                    d += "</ul>";
                }
                d += "</ul>";
            } else {
                var det = "";
                row.details.forEach(function(item) {
                        if (item !== "") {
                            det += "<li>" + item + "</li>";
                        }
                    });
                if (det !== "") {
                    if (row.hasOwnProperty("name")) {
                        d += "<ul class='details-list'><b>"+row.name+":</b><br>";
                    }
                    d += "<ul>" + det + "</ul></ul>";
                }
            }

            var r = "";
            if (d !== "") {
                detailValues.push(d);
                r += " index=\"" + detailIndex++ + "\"";
            } else {
                r += " index=0";
            }
                r += " clickable=\"1\"";

            return r;
        } // myParseTabel::myParseDetails()

        // myParseTable::isFloat()
        function isFloat(n) {
            return Number(n) === n && n % 1 !== 0;
        }

        // myParseTable::isInt()
        function isInt(n) {
            return Number(n) === n && n % 1 === 0;
        }
    }

    /// main::parseAreaTables
    function
    parseAreaTables()
    {

        // System view variables
        var table = "";

        // Source View variables
        var tableSource = "";

        // Common variables
        var area           = areaJSON,
            totalData    = [0, 0, 0, 0],
            funcLogic    = 0,
            // Max available device resources for user design partition (eg. kernel partition)
            totalMaxData = area.max_resources,
            indent       = 21,
            baseLevel    = 0;

        // add details for Data Control Overhead (source view)
        detailValues.push("<ul class='details-list'><b>Data control overhead:</b><br><ul><li>State + Feedback + Cluster Logic</li></ul></ul>");
        var dataControlDetailsIndex = detailIndex;
        detailIndex++;

        // add resources
        var result = createHighLevels(area.resources, baseLevel + 1, []);
        sumResources(totalData, result.data);
        table += result.rows;
        tableSource += table;

        // add functions
        var funcLevel = baseLevel + 1;
        var functionList = [];
        area.functions.forEach( function(d) {
            var functionData = [0, 0, 0, 0];
            var overhead = [0, 0, 0, 0];
            var sourceLines = [];
            var functionRow = "";

            funcLogic += d.hasOwnProperty('total_percent') ? d.total_percent[0] : 0;

            var funcResults = createHighLevels(d.resources, funcLevel + 1, sourceLines);
            sumResources(functionData, funcResults.data);

            // Add function basic blocks
            var basicBlock = "";
            var blockList = [];
            d.basicblocks.forEach ( function(b) {
                var blockData = [0, 0, 0, 0];
                var block = "";
                var blockRow = "";

                // Add block resources
                var bbResults = createHighLevels(b.resources, funcLevel + 2, sourceLines);
                block += bbResults.rows;
                sumResources(blockData, bbResults.data);
                sumResources(overhead, bbResults.overhead);

                // Add computation
                if (b.hasOwnProperty('computation') && b.computation.length !== 0) {
                    var compResults = createHighLevels(b.computation, funcLevel + 3, sourceLines);
                    var innerDetails = compResults.hasOwnProperty('details') ? compResults.details : [""];
                    block += createRow("Computation", compResults.data, innerDetails, -1, funcLevel + 2, "", true);
                    sumResources(blockData, compResults.data);
                    sumResources(overhead, compResults.overhead);
                    block += compResults.rows;
                }

                // Add block name row to table
                var details = b.hasOwnProperty('details') ? b.details : [""];
                blockRow = createRowWithUtilization(b.name, blockData, totalMaxData,
                                                       details, -1, funcLevel + 1, "", b.resources.length+b.computation.length)
                                                       .replace(/res-row collapse/g, 'basicblock-totalres-row collapse');
                blockRow += block;
                // Add block data to columns
                sumResources(functionData, blockData);
                blockList.push({ "name": b.name, "row": blockRow });
            }); // basic block

            // Sort Block names
            blockList.sort(nameSort);
            for (var i = 0; i < blockList.length; ++i) {
                basicBlock += blockList[i].row;
            }

            // add function name row
            var functionInfo = "";
            var details = d.hasOwnProperty('details') ? d.details : [""];
            if (funcResults.rows !== "" || basicBlock !== "") {
                functionInfo += createRowWithUtilization(d.name, functionData, totalMaxData, details, -1, baseLevel + 1, "", true)
                    .replace(/res-row collapse/g, 'function-totalres-row collapse');
            } else {
                functionInfo += createRowWithUtilization(d.name, functionData, totalMaxData, details, -1, baseLevel + 1, "", false)
                    .replace(/res-row collapse/g, 'function-totalres-row collapse');
            }

            // add source view table
            tableSource += functionInfo;
            tableSource += parseSourceInfo(overhead, funcResults.rows, sourceLines);

            // add system view to table
            functionRow += functionInfo + funcResults.rows + basicBlock;
            functionList.push({ "name": d.name, "row": functionRow });

            // add totalData
            sumResources(totalData, functionData);
        }); // function

        // Sort Block names
        functionList.sort(nameSort);
        for (var i = 0; i < functionList.length; ++i) {
            table += functionList[i].row;
        }

        // add partitions
        var tableStart = createTableHeader();
        area.partitions.forEach( function (p) {
            var partResults = createHighLevels(p.resources, 1, []);
            var details = p.hasOwnProperty('details') ? p.details : [""];
            var partitionInfo = createRowWithUtilization(p.name, partResults.data, totalMaxData, details, -1, baseLevel, "", true)
                                          .replace(/res-row collapse/g, 'partition-totalres-row collapse');
            tableStart += partitionInfo;
            tableStart += partResults.rows;
        });

        var systemName = area.name + " (Logic: " + Math.round(funcLogic) + "%)";
        var details = area.hasOwnProperty('details') ? area.details : [""];
        tableStart += createRowWithUtilization(systemName, totalData, totalMaxData, details, -1, baseLevel, "", true)
                                               .replace(/res-row collapse/g, 'module-totalres-row collapse');

        table = tableStart + table + "</tbody>";
        tableSource = tableStart + tableSource + "</tbody>";

        VIEWS.AREA_SYS.source = table;
        VIEWS.AREA_SRC.source = tableSource;

        /// parseAreaTable::sumResources
        function
        sumResources(data1, data2)
        {
            for (var i = 0; i < data1.length; ++i) { data1[i] += data2[i]; }
        }

        /// parseAreaTables::createTableHeader
        function
        createTableHeader()
        {
            var table_header = "";

            table_header += "<thead><tr class='res-heading-row' data-ar-vis=0 data-level=" + baseLevel + " id='table-header'>";
            table_header += "<th class='res-title' style='padding-left:0px'></th>";
            area.columns.forEach( function(h) {
                table_header += "<th class='res-val'>" + h + "</th>";
            });
            table_header += "<th class='res-val'>Details</th></tr></thead>";

            // Spacer row
            table_header += "<tbody><tr data-level=" + baseLevel + " id='first-row'><td>Spacer</td><td></td><td></td><td></td><td></td><td>Details</td></tr>";

            return table_header;
        }

        /// parseAreaTables::createRowWithUtilization
        function
        createRowWithUtilization(title, data, maxData, details, line, level, filename, parent)
        {
            var row = "";

            // add title and link to editor pane
            if (parent) { row += "<tr class='res-row collapse parent' data-ar-vis=0 data-level=" + level; }
            else { row += "<tr class='res-row collapse' data-ar-vis=0 data-level=" + level;}

            if (line != -1) { row += " onClick='syncEditorPaneToLine(" + line + ", \"" + filename + "\")'"; }

            if (!(details === undefined || details[0] === "")) {
                row += " clickable=\"1\"";
                row += " index=" + detailIndex;
                detailIndex += 1;
            } else {
                row += " clickable=\"1\"";
                row += " index=0";
            }

            var short_title = title.replace(/\.\/.*\//g, ''); //remove the possible file path. if there is a path, it must be a relative path starting with "./"
            if (parent) {
                row += "><td class='res-title' style=\'padding-left:" + level * indent + "px;\'><a class=\'ar-toggle glyphicon glyphicon-chevron-right\' style=\'color:black;padding-left:2px;\'></a>&nbsp" + short_title + "</td>";
            } else {
                row += "><td class='res-title' style='padding-left:" + level * indent + "px;'>" + short_title + "</td>";
            }

            // add data columns
            for (var i = 0; i < data.length; i++) {
                row += "<td class='res-val'>" + Math.round(data[i]);
                if (maxData) {
                    // Add percent utilization if max values are given.
                    row += " (" + Math.round(data[i] / maxData[i] * 100) + "%)";
                }
                row += "</td>";
            }

            // add details column
            if (details === undefined || details[0] === "") {
                row += "<td class='res-val'></td>";
            }
            else {
                row += "<td class='res-val' >";
                var detailEntry = "<ul>";
                var count = 0;
                details.forEach( function (d) {

                    // Limit details which appear in table to 3
                    if (count < 3) row += "<li>" + d.substring(0, 10) + "..." + "</li>";
                    detailEntry += "<li>" + d + "</li>";
                    count++;
                });
                detailEntry += "</ul>";
                row += "</td>";
                detailValues.push("<ul class='details-list'><b>" + short_title + ":</b><br>" + detailEntry + "</ul>");
            }
            row += "</tr>";

            return row;
        }

        /// parseAreaTables::createRow
        function
        createRow(title, data, details, line, level, filename, parent)
        {
            return createRowWithUtilization(title, data, null, details, line, level, filename, parent);
        }

        /// parseAreaTables::createSourceItem
        function
        createSourceItem(line, itemName, data, subinfos, parent, filename, isLineHeader, count, details)
        {
            var tempItem = {};
            if (parent) { tempItem.line = line; }
            tempItem.name = itemName;

            if (!parent) {
                tempItem.data = [];
                data.forEach( function(d) {
                    tempItem.data.push(d);
                });
            }
            else { tempItem.data = [0, 0, 0, 0]; }
            tempItem.highlight = isLineHeader;
            tempItem.subinfos = subinfos;
            tempItem.filename = filename;
            tempItem.count = count;
            tempItem.details = details;

            return tempItem;
        }

        /// parseAreaTables::addSourceItem
        function
        addSourceItem(parentName, line, itemName, data, filename, sourceLines, count, details)
        {
            var index = 0;
            var found = false;
            filename = filename.substring(filename.lastIndexOf('/') + 1);

            // Find parent object of same line
            for (var i = 0; i < sourceLines.length; i++) {
                if (sourceLines[i].line == line) {
                    found = true;
                    index = i;
                    break;
                }
            }

            // Create parent object of same line if not found
            if (!found) {
                if (itemName == NO_SOURCE) sourceLines.push(createSourceItem(line, NO_SOURCE, data, [], true, filename, true, 0, [""]));
                else sourceLines.push(createSourceItem(line, (filename + ":" + line), data, [], true, filename, true, 0, [""]));
                index = sourceLines.length - 1;
            }

            // Add item to proper level
            found = false;
            if (itemName == (filename + ":" + line) || itemName == NO_SOURCE) {
                sourceLines[index].subinfos.forEach( function(sub) {
                    if (sub.name == parentName) {
                        found = true;
                        for (var i = 0; i < 4; i++) {
                            sub.data[i] += data[i];
                        }
                        if (itemName == NO_SOURCE) sub.count = 0;
                        else if (count === 0) sub.count += 1;
                        else sub.count += count;
                    }
                });
                if (!found) { sourceLines[index].subinfos.push(createSourceItem(0, parentName, data, [], false, filename, false, count, details)); }
            } else {
                sourceLines[index].subinfos.forEach ( function(f) {
                    if (f.name == itemName) {
                        f.subinfos.forEach( function(sub) {
                            if (sub.name == parentName) {
                                found = true;
                                for (var i = 0; i < 4; i++) {
                                    sub.data[i] += data[i];
                                }
                                if (count === 0) sub.count += 1;
                                else sub.count += count;
                            }
                        });

                        if (!found) {
                            f.subinfos.push(createSourceItem(0, parentName, data, [], false, filename, false, count, details));
                        }
                        sumResources(f.data, data);
                        found = true;
                    }
                });
                if (!found) {
                    sourceLines[index].subinfos.push(createSourceItem(0, itemName, data,
                                                                      [createSourceItem(0, parentName, data, [], false, filename, false, count, details)],
                                                                      false, filename, false, 0, details));
                }
            }

            sumResources(sourceLines[index].data, data);

            return sourceLines;
        }

        /// parseAreaTables::createHighLevels
        function
        createHighLevels(varIter, dataLevel, sourceLines)
        {
            // Return an object containing the sum of the area usage of all elements
            // in varIter and all the HTML table rows for every element in varIter.
            // The HTML table rows are sorted first by line number and then by name.

            var resourceList = [];
            var sumData = [0, 0, 0, 0];
            var overheadData = [0, 0, 0, 0];

            varIter.forEach ( function(g) {
                var isChildofLine = false;
                var isAddedToOverhead = false;
                var parent = true;
                var line = -1;
                var filename = "";
                var details = [""];
                var row = "";

                // Check if parent and if item has corresponding line number before assigning properties
                if (!g.hasOwnProperty('subinfos') || g.subinfos.length === 0) { parent = false; }

                if (g.hasOwnProperty('debug') && g.debug[0][0].line !== 0) {
                    line = g.debug[0][0].line;
                    filename = getFilename(g.debug[0][0].filename);
                }

                // Add data to running total of Data Control Overhead in Source view
                if ((!g.hasOwnProperty('subinfos') || g.subinfos.length === 0) || g.name == "Feedback") {
                    sumResources(overheadData, g.data);
                    isAddedToOverhead = true;
                } else if (g.hasOwnProperty('debug') && g.hasOwnProperty('subinfos') && g.debug[0][0].line !== 0) {
                    isChildofLine = true;
                }

                // Add data to running total of row
                sumResources(sumData, g.data);

                if (g.hasOwnProperty('details')) { details = g.details; }

                row += createRow(g.name, g.data, details, line, dataLevel, filename, parent);

                // Add subinfos
                if (g.hasOwnProperty('subinfos')) {
                    var subinfoList = [];
                    g.subinfos.forEach( function(s) {
                        var line = -1;
                        var filename = "";
                        var linename = s.info.name;
                        var subRow = "";

                        if (s.info.hasOwnProperty('debug') && s.info.debug[0][0].line !== 0) {
                            line = s.info.debug[0][0].line;
                            filename = getFilename(s.info.debug[0][0].filename);
                        }

                        if (s.hasOwnProperty('count') && s.count > 1) linename += " (x" + s.count + ")";

                        var details = s.info.hasOwnProperty('details') ? s.info.details : [""];
                        subRow = createRow(linename, s.info.data, details, line, (dataLevel + 1), filename, false);
                        subinfoList.push({ "name": linename, "row": subRow });

                        // Add items to source view
                        if (g.name != "Feedback" && s.info.hasOwnProperty('debug') && s.info.debug[0][0].line !== 0) {
                            addSourceItem(g.name, s.info.debug[0][0].line, s.info.name, s.info.data,
                                            getFilename(s.info.debug[0][0].filename), sourceLines, s.count, details);
                        } else if (isChildofLine) {
                            addSourceItem(s.info.name, g.debug[0][0].line, g.name, s.info.data,
                                            getFilename(g.debug[0][0].filename), sourceLines, s.count, details);
                        } else if (!isAddedToOverhead) {
                            if (g.name == NO_SOURCE)
                                addSourceItem(s.info.name, -1, NO_SOURCE, s.info.data,"", sourceLines, 0, details);
                            else if (s.info.name != NO_SOURCE)
                                sumResources(overheadData, s.info.data);
                            else
                                addSourceItem(g.name, -1, NO_SOURCE, s.info.data, "", sourceLines, 0, details);
                        }
                    }); // subinfo

                    subinfoList.sort(nameSort);
                    for (var i = 0; i < subinfoList.length; ++i) {
                        row += subinfoList[i].row;
                    }
                }

                resourceList.push({ "line": line, "name": g.name, "row": row });
            });

            resourceList.sort(function (data1, data2) {
                // Sort by line number first and then by name.
                if (data1.line != data2.line) return data1.line - data2.line;
                if (data1.name < data2.name) return -1;
                if (data1.name > data2.name) return 1;
                return 0;
            });

            var allRows = "";
            for (var i = 0; i < resourceList.length; ++i) {
                allRows += resourceList[i].row;
            }

            return { "data": sumData, "overhead": overheadData, "rows": allRows };
        }

        function
        nameSort(data1, data2)
        {
            var isUpper1 = (data1.name[0] && data1.name[0] == data1.name[0].toUpperCase());
            var isUpper2 = (data2.name[0] && data2.name[0] == data2.name[0].toUpperCase());

            //  undefined, {numeric: true, sensitivity: 'case'}
            if      ( isUpper1 && !isUpper2) return -1;
            else if ( isUpper2 && !isUpper1) return 1;
            else return data1.name.localeCompare(data2.name, 'en-US-u-kn-true');
        }

        /// parseAreaTables::parseSourceInfo
        function
        parseSourceInfo(overhead, funcRows, sourceLines)
        {
            var sourceTable = "";

            sourceTable += "<tr class='res-row collapse' data-ar-vis=0 data-level=" + (funcLevel + 1) +
                        " index=" + dataControlDetailsIndex + " clickable=1><td class='res-title' style=\'padding-left:" + ((funcLevel + 1) * indent) +
                        "px'>Data control overhead</td>";
            overhead.forEach( function(ov) {
                sourceTable += "<td class='res-val'>" + Math.round(ov) + "</td>";
            });
            sourceTable += "<td class='res-val'><li>" + ("State + Feedback + Cluster Logic").substring(0, 10) + "..." + "</li></td></tr>";
            sourceTable += funcRows;

            sourceTable += addSubHeadings(sourceLines, 0, funcLevel + 1);
            return sourceTable;
        }

        /// parseAreaTables::addSubHeadings
        function
        addSubHeadings(tRows, line, level)
        {
            var subTable = "";
            var rowName = "";

            tRows.forEach( function(row) {
                var details;
                if (level == 2) { line = row.line; }
                if (row.highlight) {
                    details = row.hasOwnProperty('details') ? row.details : [""];
                    subTable += createRow(row.name, row.data, details, line, level, row.filename, row.subinfos.length).replace(/res-row collapse/g, 'basicblock-totalres-row collapse');
                } else {
                    if (row.count > 1) rowName = row.name + "(x" + row.count + ")";
                    else rowName = row.name;
                    details = row.hasOwnProperty('details') ? row.details : [""];
                    subTable += createRow(rowName, row.data, details, line, level, row.filename, row.subinfos.length);
                }

                if (row.subinfos.length !== 0) { subTable += addSubHeadings(row.subinfos, line, (level + 1)); }
            });
            return(subTable);
        }
    }

    /// main::parseLoopTable
    function
    parseLoopTable(theJSON, parseLoops) {
        var loop = theJSON;
        var indent = 12;
        var htmlOut = "";

        if (loop.functions.length === 0) {
            return "<i>&nbspDesign has no loops</i>";
        }

        var first = true;

        htmlOut = createTableHeader();

        loop.functions.forEach( function(d) {
            htmlOut += addResource(d);
        });

        htmlOut += "</tbody>";
        return htmlOut;

        /// parseLoopTable::createTableHeader
        function
        createTableHeader() {
            var table_header = "";

            table_header += "<thead><tr class='res-heading-row' data-ar-vis=0 data-level=0 id='table-header'><th class='res-title'></th>";
            theJSON.columns.forEach(function (h) {
                table_header += "<th class='res-val'>" + h + "</th>";
            });
            table_header += "<th class='res-val'>Details</th></tr></thead>";

            // Spacer row with fake data
            table_header += "<tbody><tr data-level=0 id=first-row><td>Spacer</td>";
            theJSON.columns.forEach(function (h) {
                table_header += "<td>" + h + "</td>";
            });
            table_header += "<td>Details</td></tr>";  // use two Details words as default spacing

            return (table_header);
        }

        /// parseLoopTable::createRow
        function
        createRow(title, data, details, line, level, filename, resources)
        {
            var row = "<tr class='res-row ";
            var hasDetails = true;
            if (details === undefined || details.length === 0) {
                hasDetails = false;
            }

            // Custom class to show/hide Fully unrolled loops
            if (title == "Fully unrolled loop") { row += " ful"; }

            row += "'";

            // Assign optIndex to 0 if no details or to a value
            if (hasDetails) { row += " index=" + detailIndex + " clickable=1"; }
            else { row += " index=0 clickable=1"; }

            if (line > 0) { row += " onClick='syncEditorPaneToLine(" + line + ", \"" + filename + "\")'"; }


            row += "><td class='res-title' style='text-indent:" + level*indent + "px'>";
            row += title;
            if (parseLoops) {
              row += " (";
              if (line > 0) { row += filename.substring(filename.lastIndexOf('/') + 1) + ":" + line; }
              else if (line === 0) { row += filename.substring(filename.lastIndexOf('/') + 1); }
              else { row += "Unknown location"; }
              row  += ")";
            }
            row  += "</td>";

            // add data columns
            for (var j = 0; j < data.length; j++) {
                row += "<td class='res-val'>" + data[j] + "</td>";
            }

            // add details column
            if (hasDetails) { row += "<td class='res-val' >" + details[0] + "</td>"; }
            else { row += "<td class='res-val'></td>"; }

            // details section
            if (resources !== undefined && resources.length > 0) {
                var infohtml = "<ul class='details-list'><b>" + title + ":</b><br>";
                for (var ri = 0; ri < resources.length; ri++) {
                    if (resources[ri].name !== undefined) infohtml += resources[ri].name + "<br>";
                    if (resources[ri].subinfos === undefined) {
                        continue;
                    }
                    infohtml += "<ul>";
                    var subinfos = resources[ri].subinfos;
                    for (var i = 0; i < subinfos.length; i++) {
                        if (subinfos[i].info.debug !== undefined && subinfos[i].info.debug.length > 0 && subinfos[i].info.debug[0].length > 0) {
                            var infoFilename = getFilename(subinfos[i].info.debug[0][0].filename);
                            var short_infoFilename = infoFilename.substring(infoFilename.lastIndexOf('/') + 1); //only use the file name, no directories
                            var infoLine = subinfos[i].info.debug[0][0].line;
                            //var infoNodeId = subinfos[i].info.debug[0][0].nodeId;  //Feature in 17.0 Add node ID to debug info
                            infohtml += "<li>" + subinfos[i].info.name + " (";
                            infohtml += "<a style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + short_infoFilename + ":" + infoLine + "</a>";

                            // there can be multiple debug location, i.e. LSU merge
                            for (var di = 1; di < subinfos[i].info.debug[0].length; di++) {
                                infoLine = subinfos[i].info.debug[0][di].line;
                                if (infoFilename != getFilename(subinfos[i].info.debug[0][di].filename)) {
                                    infoFilename = getFilename(subinfos[i].info.debug[0][di].filename);
                                    infohtml += ", <p style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + short_infoFilename + ":" + infoLine + "</p>";
                                }
                                else {
                                    infohtml += ", <a style='cursor:pointer;color:#0000EE' onClick='syncEditorPaneToLine(" + infoLine + ",\"" + infoFilename + "\")'>" + infoLine + "</a>";
                                }
                            }
                            infohtml += ")";
                        } else {
                            infohtml += "<li>" + subinfos[i].info.name + " (Unknown location)";
                        }
                        infohtml += "</li>";
                    }
                    infohtml += "</ul>";
                }
                infohtml += "</ul>";
                detailValues.push(infohtml);
                detailIndex += 1;
            }
            else {
                if (hasDetails) {
                    detailValues.push("<ul class='details-list'><b>" + title + ":</b><br>" + details[0] + "</ul>");
                    detailIndex += 1;
                }
            }
            row += "</tr>";
            return (row);
        }

        /// parseLoopTable::addResource
        function
        addResource(r)
        {
            var line = -1;
            var filename = "";
            var details = "";
            var level = 1;  // loop level starts at level 1. Level 0 is for kernel

            if (r.hasOwnProperty('debug') && r.debug[0].length > 0) {
                line = r.debug[0][0].line;
                if (line > 0) { filename = getFilename(r.debug[0][0].filename); }
                else { filename = r.debug[0][0].filename; }
                level = r.debug[0][0].level;
            }

            return createRow(r.name, r.data, r.details, line, level, filename, r.resources);
        }

    }

    /// main::initializeViews()
    function initializeViews() {
        // create a div for each view, and set it to "hidden"; also create
        // a menu entry for each view
        for (var v in VIEWS) {
            var index = VIEWS[v];
            if (index.name !== "") {
                $("#report-pane")[0].insertAdjacentHTML("beforeend", "<div id=\"report-pane-view" + index.value + "\" class=\"report-pane-view-style\"></div>");
                $("#report-pane-view" + index.value).toggle();
                var li = "<li class=\"dropdown_nav\" viewId=" + v + "><a href=\"" + index.hash;
                li += "\" style='color:black'>" + index.name + "</a></li>";
                $("#view-menu")[0].insertAdjacentHTML("beforeend", li);
            }
            viewHash[index.hash] = v;
            addReportColumn(index);
        }

        // display the current view
        currentPane = "#report-pane-view" + view.value;
        $(currentPane).toggle();
    }

    /// main::parseFileInfos
    function
    parseFileInfos()
    {
        var fileInfos = [];

        if (!isValidFileList || !isValidSystemViewer || !isValidMemoryViewer) return fileJSON;

        fileInfos = fileJSON ;
        curFile = fileInfos[0].path;

        // Replace the file info indices with those from the fileIndexMap
        var i = 0;
        while (i < fileInfos.length) {
            var index = fileIndexMap[ fileInfos[i].path ];
            if (!index) {
                fileInfos.splice(i, 1);
                continue;
            }
            fileInfos[i].index = index;
            i++;
        }

        verifyFileInfos( fileInfos );

        return fileInfos;
    }

    /// main::getFileContents
    function
    getFileContents( filePath )
    {
        var file = filePath;
        return filePath;
    }

    /// main::verifyFileInfos
    function
    verifyFileInfos( fileInfos )
    {
        fileInfos.forEach( function( d ) {
            warn( d.index == fileIndexMap[ d.path ], "FileInfo's invalid!" );
        });
    }

    /// main::createTabIndexMap
    function
    createTabIndexMap( fileInfos )
    {
        var tabIndexMap = {};
        fileInfos.forEach( function( d, i ) {
            tabIndexMap[ d.index ] = i;
        } );

        return tabIndexMap;
    }

    /// main::addReportTabs
    function
    addReportTabs()
    {
        // Any time a tab is shown, update the contents
        $( document ).on( 'shown.bs.tab', 'a[data-toggle="tab"]', function( e ) {
            var anchor = e.target;
        });
    }

    /// main::verifyThings
    function
    verifyThings()
    {
        // 1. Verify fileIndex/tabIndex maps:
        for( var filename in fileIndexMap ) {
            if ( !fileIndexMap.hasOwnProperty( filename ) ) continue;

            var fileIndex = fileIndexMap[ filename ];
            var tabIndex = tabIndexMap[ fileIndex ];
            warn( tabIndex === parseInt( tabIndex, 10 ), "tabIndex is not an integer!" ); // Ensure is integer

            // Get the tab at that index
            var theTab = $( "#editor-pane #editor-pane-nav" ).children().eq( tabIndex ).text();
        }
    }
}

// TODO Any functions that are called only once should be moved to the
// callee body

function
addFileTabs( fileInfos )
{
    var navTabs = d3.select( "#editor-pane" ).selectAll( "#editor-pane-nav" );
    var listElements = navTabs.selectAll( "li" )
        .data( fileInfos )
        .enter()
        .append( "li" )
        .attr( "class", function( d, i ) {
            var classname = "";
            if (i === 0) {
                classname = "active";
                $('.selected').html(d.name);
                $('.mouseoverbuttontext').html(d.absName);
            }
            return classname;
        });

    var anchors = listElements
        .append( "a" )
        .attr( "class", "mouseover")
        .attr( "data-target", function( d ) { return "#file" + d.index; } )
        .text( function( d ) { return d.name; });

    //show file path information using hover text
    anchors = listElements
        .append( "p" )
        .attr( "class", "mouseovertext")
        .text( function( d ) {
          return d.absName;
        });

    $( "#editor-pane-nav" ).on( "click", "a", function( e ) {
        $(this).tab("show");
        $("#editor-pane-nav li").attr("class", "");
        $(this).attr("class", "active");

        $('.selected').html($(this).text());
        $('.mouseoverbuttontext').html($(this).next()[0].innerHTML);
    });
}

function
addFileContents( fileInfos )
{
    var tabContent = d3.select( "#editor-pane" ).selectAll( ".tab-content" );

    var divs = tabContent.selectAll( "div" )
        .data( fileInfos )
        .enter()
        .append( "div" )
        .attr( "class", function( d, i ) {
            var classname = "tab-pane";
            if ( i === 0 ) classname = classname + " in active";
            return classname;
        })
        .attr( "id", function( d ) { return "file" + d.index; } )
        .attr( "style", "height:500px;" );

    var editorDivs = divs
        .append( "div" )
        .attr( "class", "well" );

    editorDivs.each( SetupEditor );

    /// Functions
    function
    SetupEditor( fileInfo )
    {
        var editor = ace.edit( this ); // "this" is the DOM element
        fileInfo.editor = editor;

        editor.setTheme( "../ace/theme/xcode" );
        editor.setFontSize( 12 );
        editor.getSession().setMode( "../ace/mode/c_cpp" );
        editor.getSession().setUseWrapMode( true );
        editor.getSession().setNewLineMode( "unix" );

        // Replace \r\n with \n in the file content (for windows)
        editor.setValue( fileInfo.content.replace( /(\r\n)/gm, "\n" ) );
        editor.setReadOnly( true );
        editor.scrollToLine( 1, true, true, function() {} );
        editor.gotoLine( 1 );
    }
}

///// Global functions

/// Syncs the editor and details pane to this node
function
syncPanesToNode( node )
{
    syncEditorPaneToNode( node );
}

// Assumes the node has the file index and line number
// in "file" and "line" respectively
function
syncEditorPaneToNode( node )
{
    // Note: This check returns true if node.file is undefined or if it's  0
    // This is good because file index 0 is used for unknown
    if ( !node.file ) return;

    var tabIndex = tabIndexMap[ node.file ];
    var target = "li:eq(" + tabIndex + ")";
    $( "#editor-pane-nav " + target + " a" ).tab( "show" );

    var editor = fileInfos[ tabIndex ].editor;
    warn( editor, "Editor invalid!" );
    var line = node.line;
    warn( line > 0, "Editor line number is less than or equal to 0!" );
    editor.focus();
    editor.resize( true );
    editor.scrollToLine( line, true, true, function() {} );
    editor.gotoLine( line );
}

function
adjustToWindowEvent()
{
    setReportPaneHeight();
    stickTableHeader();
    if (!sideCollapsed) adjustEditorButtons();
}

function resizeEditor()
{
    if (sideCollapsed) return;

    var editor;
    for (var i = 0; i < fileInfos.length; i++) {
        if (fileInfos[i].name == curFile) {
            editor = fileInfos[i].editor;
            break;
        }
    }
    if (editor) editor.resize();
}

function refreshAreaVisibility() {
    $(currentPane + " #area-table-content tr").each(function() {
        if ($(this).attr('data-level') == "0" && $(this).is(":hidden")) {
            $(this).toggle();
        }
    });
}

function updateURLHash() {
    if (history.pushState) {
        history.pushState(null, null, view.hash);
    } else {
        location.hash(view.hash);
    }
}

function goToView(viewId, update) {
    var newView = VIEWS[viewId];
    if (!newView) { updateURLHash(); return; }
    if (view != newView) {
        $(currentPane).toggle();
        view = newView;
        currentPane = "#report-pane-view" + view.value;
        $(currentPane).toggle();
        if (view.clickDown !== null && view.clickDown.getAttribute('index')) {
            changeDivContent(view.clickDown.getAttribute('index'));
        } else {
            changeDivContent(0);
        }
    }
    if (update) {
        updateURLHash();
    }
    if (view == VIEWS.SPV) {
        if (!spv_graph && isValidSystemViewer) spv_graph = new StartGraph(mavData, "SPV");
        else if (isValidSystemViewer) spv_graph.refreshGraph();
        else $('#SPG').html("&nbspSystem viewer data is invalid!");
    }
    else if (view == VIEWS.LMEM) {
        if (!lmem_graph && isValidMemoryViewer) {
            var hasLMem = addLMemTree();
            if (hasLMem) {
                $('#LMEMG').html("<br>&nbspClick on a memory variable to render it!");
            } else {
                $('#LMEMG').html("&nbspThere is no " + ((flow == FLOWS.OPENCL) ? "kernel" : "component") + " memory variable in the design file!");
            }
        }
        else if (isValidMemoryViewer) lmem_graph.refreshGraph();
        else $('#LMEMG').html("&nbsp " + view.name + " data is invalid!");
    }
    else if (view == VIEWS.CSPV) {
        if (!cspv_graph && isValidSystemViewer) {
            var hasComp = addComponentTree();
            if (hasComp) {
                $('#CSPG').html("<br>&nbspClick on a component to render it!");
            } else {
                $('#CSPG').html("&nbspThere is no " + ((flow == FLOWS.OPENCL) ? "kernel" : "component") + " in the design file!");
            }
        }
        else if (isValidSystemViewer) cspv_graph.refreshGraph();
        else $('#CSPG').html("&nbsp " + view.name + " data is invalid!");
    }
    refreshAreaVisibility();
    adjustToWindowEvent();
}

function addReportColumn(reportEnum) {
    var report = REPORT_PANE_HTML;

    if (reportEnum == VIEWS.OPT) {
        report += LOOP_ANALYSIS_NAME;
        report += "</div><div class='panel-body' id='report-body' onscroll='adjustToWindowEvent()'>";
        report += "<table class='table table-hover' id='area-table-content'></table>";
    } else if (reportEnum == VIEWS.AREA_SYS || reportEnum == VIEWS.AREA_SRC) {
        report += "<table style='width:100%'><tr><td class='panel-heading-text'>";
        report += reportEnum.name + "<br>(area utilization values are estimated)<br>Notation <i>file:X</i> > <i>file:Y</i> indicates a function call on line X was inlined using code on line Y.";
        if (isValidAreaReport && !areaJSON.debug_enabled) {
            report += "<br><strong>Recompile without <tt>-g0</tt> for detailed area breakdown by source line.</strong>";
        }
        report += "</td><td>";
        report += "<span style='float:right'>";
        report += "<button id='collapseAll' type='button' class='text-left exp-col-btn'><span class='glyphicon glyphicon-chevron-up'></span>&nbsp;Collapse All&nbsp;</button>";
        report += "<button id='expandAll' type='button' class='text-left exp-col-btn'><span class='glyphicon glyphicon-chevron-down'></span>&nbsp;Expand All&nbsp;</button>";
        report += "</span>";
        report += "</td></tr></table>";

        report += "</div><div class='panel-body' id='report-body' onscroll='adjustToWindowEvent()'>";
        report += "<table class='table table-hover' id='area-table-content'></table>";
    } else if (reportEnum == VIEWS.SPV) {
        report = "<div class=\"classWithPad\" id=\"spv\"><div class=\"panel panel-default\" id=\"report-panel-body\"><div class=\"panel-heading\">";
        report += reportEnum.name;
        report += "<span style='float:right'><div id=\"layers\"></div></span>";
        report += "</div><div id='SPG' class='panel-body fade in active'></div>";
    } else if (reportEnum == VIEWS.SUMMARY) {
        report += reportEnum.name + "</div><div class='panel-body' id='report-body' onscroll='adjustToWindowEvent()'>";
        report += "<div id='area-table-content'></div>";
    } else if (reportEnum == VIEWS.VERIF) {
        report += reportEnum.name + "</div><div class='panel-body' id='report-body' onscroll='adjustToWindowEvent()'>";
        report += "<table class='table table-hover' id='area-table-content'></table>";
    } else if (reportEnum == VIEWS.LMEM) {
        report = "<div id=\"tree-list\" class=\"col col-sm-3\" id=\"report-pane-col1\">";
        report += "<div class=\"panel panel-default\" id=\"report-panel-tree\">";
        report += "<div class=\"panel-heading\">Memory list</div>";
        report += "<div id=\"tree-body\" class='panel-body'><div id=\"lmem-tree\"></div></div>";
        report += "</div></div>";

        report += "<div class=\"col col-sm-9\" id=\"report-pane-col2\">";
        report += "<div class=\"classWithPad\" id=\"lmem\"><div class=\"panel panel-default\" id=\"report-panel-body\"><div class=\"panel-heading\">";
        report += reportEnum.name;
        report += "<span style='float:right'><div id=\"layers-lmem\"></div></span>";
        report += "</div><div id='LMEMG' class='panel-body fade in active'></div>";
    } else if (reportEnum == VIEWS.CSPV) {
        report = "<div id=\"tree-list\" class=\"col col-sm-3\" id=\"report-pane-col1\">";
        report += "<div class=\"panel panel-default\" id=\"report-panel-tree\">";
        report += "<div class=\"panel-heading\">Component list</div>";
        report += "<div id=\"tree-body\" class='panel-body'><div id=\"comp-tree\"></div></div>";
        report += "</div></div>";

        report += "<div class=\"col col-sm-9\" id=\"report-pane-col2\">";
        report += "<div class=\"classWithPad\" id=\"comp\"><div class=\"panel panel-default\" id=\"report-panel-body\"><div class=\"panel-heading\">";
        report += reportEnum.name;
        report += "<span style='float:right'><div id=\"layers-comp\"></div></span>";
        report += "</div><div id='CSPG' class='panel-body fade in active'></div>";
    }

    report += "</div></div></div>";

    $("#report-pane-view" + reportEnum.value).html(report);
    $("#report-pane-view" + reportEnum.value + " #area-table-content").html(reportEnum.source);
}

function unsetClick() {
  if(view.clickDown !== null) {
    view.clickDown.classList.remove("nohover");
    view.clickDown.classList.remove("selected-item-highlight");
    view.clickDown = null;
    changeDivContent(0);
  }
}

// Go to the requested view when the URL hash is changed
$(window).on('hashchange', function() {
      goToView(viewHash[window.location.hash]);
    });

// navigation bar tree toggle
$(document).ready(function () {
    $('label.tree-toggle').click(function () {
        $(this).parent().children('ul.tree').toggle(200);
    });

    if (window.location.hash === "") {
        updateURLHash();
    } else {
        goToView(viewHash[window.location.hash]);
    }

    $(window).resize(function () {
        adjustToWindowEvent();
        resizeEditor();
    });

    function getChildren($row) {
        var children = [], level = $row.attr('data-level');
        var isExpanding;
        var maxExpandedLevel = Number(level) + 1;

        // Check if expanding or collapsing
        if ($row.next().is(":hidden")) {
            isExpanding = true;
        } else {
            isExpanding = false;
        }

        while($row.next().attr('data-level') > level) {
            // Always expand or collapse immediate child
            if($row.next().attr('data-level')-1 == level) {
                children.push($row.next());
                $row.next().attr('data-ar-vis',$row.next().attr('data-ar-vis')==1?0:1);
            } else {
                // expand if previously was expanded and parent has been expanded - maxExpandedLevel is used to tell if a child's immediate parent has been expanded
                if ($row.next().attr('data-ar-vis')==1 && isExpanding && $row.next().attr('data-level')<=(maxExpandedLevel+1)) {
                    children.push($row.next());
                    maxExpandedLevel = Math.max(maxExpandedLevel, $row.next().attr('data-level'));
                    // collapse if visible and element is some descendant of row which has been clicked
                } else if (!isExpanding && $row.next().is(":visible")) {
                    children.push($row.next());
                }
            }
            $row = $row.next();
        }
        return children;
    }


    // Expand or collapse when parent table row clicked
    $('#report-pane').on('click', '.parent', function() {
        var children = getChildren($(this));
        $.each(children, function () {
            $(this).toggle();
        });
        $(this).find('.ar-toggle').toggleClass('glyphicon-chevron-down glyphicon-chevron-right');
        stickTableHeader();
    });

    $('#report-pane').on('click', 'tr', function(d) {
        // do not change clicked state if we click an anchor (ie expand/collapse chevron)
        if (d.target.tagName.toLowerCase() === "a") return;
        // traverse up the DOMtree until we get to the table row
        for (d = d.target; d && d !== document; d = d.parentNode) {
            if (d.tagName.toLowerCase() === "tr") break;
        }
        // check to see if row is 'clickable'
        if (!$(this).attr('clickable')) return;
        if (view.clickDown == d) {
            // deselect row
            unsetClick();
        } else {
            // else select new row
            if (view.clickDown) {
                // deselect previous row
                unsetClick();
            }
            if ($(this).attr('index')) {
                // update "details" pane
                changeDivContent($(this).attr('index'));
            }
            view.clickDown = d;
            d.classList.add("nohover");
            d.classList.add("selected-item-highlight");
        }
    });

    // Display details on mouseover
    $('#report-pane').on('mouseover', 'tr', function() {
        if(view.clickDown === null && $(this).attr('index') && detailCollapsed === false) {
            changeDivContent($(this).attr('index'));
        }
    });

    $('.dropdown_nav').on('click', function () {
        // Clicking a .dropdown_nav item changes the page hash.
        // If the onHashChange event is supported in the browser, we will change views
        // using the corresponding event handler. Otherwise, do it explicitly here.
        if (!("onhashchange" in window)) {
            var viewId = $(this).attr("viewId");
            goToView(viewId);
        }
    });

    $('#collapse_source').on('click', collapseAceEditor);
    $('body').on('click', '#close-source', function () {
        collapseAceEditor();
        flashMenu();
    });

    $('#collapse_details').on('click', collapseDetails);
    $('body').on('click', '#close-details', function () {
        collapseDetails();
        flashMenu();
    });

    $('#report-pane').on('click', '#showFullyUnrolled', function() {
        $('.ful').each(function () {
            $(this).toggle();
        });
        stickTableHeader();
    });

    // Expand all the rows in area table
    $('#report-pane').on('click', '#expandAll', function () {
        // Get all the rows in the table which can expand/collapse
        var parents = $(currentPane + ' .parent');

        $.each(parents, function () {
            // Toggle all the children of that parent row
            var children = getChildren($(this));
            $.each(children, function () {
                // Set the data-ar-vis to be one so that it will expand afterwards
                $(this).attr('data-ar-vis', 1);
                // Only toggle if row is hidden and need to expand, or visible and need to collapse
                if ($(this).is(":hidden"))
                    $(this).toggle();
            });

            // Make all the arrow icons pointing down
            var iconsToToggle = $(this).find('.ar-toggle');
            $.each(iconsToToggle, function () {
                if ($(this).hasClass('glyphicon-chevron-right'))
                    $(this).toggleClass('glyphicon-chevron-down glyphicon-chevron-right');
            });
        });

        stickTableHeader();
    });

    // Collapse all the rows in area table
    $('#report-pane').on('click', '#collapseAll', function () {
        // Get all the rows in the table which can expand/collapse
        var parents = $(currentPane + ' .parent').toArray().reverse();

        $.each(parents, function () {
            // Toggle all the children of that parent row
            var children = getChildren($(this));
            $.each(children, function () {
                // Set the data-ar-vis to be zero so that the row states resets
                $(this).attr('data-ar-vis', 0);
                // Only toggle if row is hidden and need to expand, or visible and need to collapse
                if (!$(this).is(":hidden"))
                    $(this).toggle();
            });

            // Make all the arrow icons pointing down
            var iconsToToggle = $(this).find('.ar-toggle');
            $.each(iconsToToggle, function () {
                if ($(this).hasClass('glyphicon-chevron-down'))
                    $(this).toggleClass('glyphicon-chevron-down glyphicon-chevron-right');
            });
        });

        stickTableHeader();
    });

});

function
flashMenu()
{
    var $menuElement = $('#collapse_sidebar');
    var interval = 500;
    $menuElement.fadeIn(interval, function () {
        $menuElement.css("color", "#80bfff");
        $menuElement.css("border", "1px solid #80bfff");
        $menuElement.fadeOut(interval, function () {
            $menuElement.fadeIn(interval, function () {
                $menuElement.fadeOut(interval, function () {
                    $menuElement.fadeIn(interval, function () {
                        $menuElement.css("color", "black");
                        $menuElement.css("border", "1px solid transparent");
                    });
                });
            });
        });
    });
}

function
collapseDetails()
{
    $('#detail-pane').toggle();
    detailCollapsed = (detailCollapsed) ? false : true;
    if (detailCollapsed) {
        // when details is collapsed, clear it
        changeDivContent(0);
    } else if (view.clickDown) {
        // when details is un-collapsed, update contents, if valid
        changeDivContent(view.clickDown.getAttribute('index'));
    }
    adjustToWindowEvent();
    resizeEditor();
}

function
collapseAceEditor()
{
    if (!isValidFileList) return;

    $('#editor-pane').toggle();
    if (sideCollapsed) {
        $('#report-pane').css('width', '60%');
        sideCollapsed = false;
    } else {
        $('#report-pane').css('width', '100%');
        sideCollapsed = true;
    }
    adjustToWindowEvent();
}

// Forces header of area report to remain at the top of the area table during scrolling
// (the header is the row with the column titles - ALUTs, FFs, etc.)
function
stickTableHeader()
{
    var reportBody = $(currentPane + " #report-body")[0];
    if (!reportBody) return;
    var areaTable = $(currentPane + " #area-table-content")[0];
    if (!areaTable) return;
    var panel = reportBody.getBoundingClientRect();
    var table = areaTable.getBoundingClientRect();
    var rowWidth = 0.0;
    var tableWidth = table.width;
    var systemRow;

    var tableHeader = $(currentPane + ' #table-header').filter(function () {
        if ($(this).is(":visible")) return true;
        return false;
    });

    systemRow = $(currentPane + ' #first-row')
        .filter(function () {
            if ($(this).is(":visible")) return true;
            return false;
        });

    tableHeader.css("position", "absolute")
        .css("top", (panel.top - table.top))
        .css("left", 0);

    tableHeader.find('th').each(function (i) {
        var itemWidth = (systemRow.find('td').eq(i))[0].getBoundingClientRect().width;
        if (i === 0) {
            // This column contains the expand/collapse all button. Check if need to resize button
            if (itemWidth < $('#collapseAll').outerWidth() || itemWidth < 116) {
                $('#collapseAll').outerWidth(itemWidth);
                $('#expandAll').outerWidth(itemWidth);
            } else {
                $('#collapseAll').outerWidth(116);
                $('#expandAll').outerWidth(116);
            }
        }
        rowWidth += itemWidth;

        $(this).css('min-width', itemWidth);
    });

    // Set the Spacer row height equal to current tableHeader height
    systemRow.css("height", tableHeader.outerHeight());

    // if we just hid the selected row, unselect it and clear details pane
    if (view.clickDown && view.clickDown.offsetParent === null) {
        unsetClick();
    }
}

function
adjustEditorButtons()
{
    var editorWidth = $("#editor-pane").width();
    var editorExitButton = $("#close-source").outerWidth(true);
    $("#editor-nav-button").css("width", editorWidth - editorExitButton - 1);
}

function
setReportPaneHeight()
{
    var viewPortHeight = $(window).height() - 1;
    var navBarHeight = $(".navbar-collapse").height();
    var detailHeight = (detailCollapsed) ? 16 : $("#detail-pane").height();
    $('#report-pane, #editor-pane').css('height', viewPortHeight - navBarHeight - detailHeight);

    var panelHeight = $("#report-pane").height();
    var panelHeadingHeight = $(currentPane + ' .panel-heading').outerHeight();
    $(currentPane + ' #report-body').css('height', panelHeight - panelHeadingHeight);
    $(currentPane).css('height', $('#report-pane').innerHeight());

    if (view == VIEWS.SPV) {
        $('#SPG').css('height', panelHeight - panelHeadingHeight);
        $('#spg').css('height', panelHeight - panelHeadingHeight);
        $('#spg').css('width', $('#report-pane').innerWidth());
    }

    if (view == VIEWS.LMEM) {
        $('#LMEMG').css('height', panelHeight - panelHeadingHeight);
        $('#lmemg').css('height', panelHeight - panelHeadingHeight);
        $('#lmemg').css('width', $('#report-pane').innerWidth());
        $('ul.fancytree-container').css('height', panelHeight - panelHeadingHeight);
    }

    if (view == VIEWS.CSPV) {
        $('#CSPG').css('height', panelHeight - panelHeadingHeight);
        $('#cspg').css('height', panelHeight - panelHeadingHeight);
        $('#cspg').css('width', $('#report-pane').innerWidth());
        $('ul.fancytree-container').css('height', panelHeight - panelHeadingHeight);
    }

    var editorHeadingHeight = $('.input-group-btn').outerHeight();
    $('.tab-pane').css('height', panelHeight - editorHeadingHeight);

}

function
changeDivContent(idx, detailsArray)
{
    if (view == VIEWS.SPV || view == VIEWS.LMEM || view == VIEWS.CSPV) {
        var detailsTable = "<table id='DetailsTable'>";
        if (detailsArray) {
            detailsArray.forEach( function(da, i) {
                if(i & 1) { detailsTable += "<tr class='table-row-gray'>"; }
                else { detailsTable += "<tr>"; }
                detailsTable += "<td>" + da.first + "</td><td>" + da.second + "</td></tr>";
            });
        }
        detailsTable += "</table>";
        document.getElementById("details").innerHTML = detailsTable;
    } else {
        document.getElementById("details").innerHTML = detailValues[idx];
    }
}

function
syncEditorPaneToLine( line, filename )
{
    var node;
    var editor;
    var index = 0;

    if (line == -1 || !isValidFileList) return;
    curFile = filename;

    for (var i = 0; i < fileInfos.length; i++) {
        if (fileInfos[i].name == filename || fileInfos[i].path == filename) {
            editor = fileInfos[i].editor;
            index = fileInfos[i].index;
            break;
        }
    }
    warn( editor, "Editor invalid!" );
    warn( line > 0, "Editor line number invalid!" );
    var tabIndex = tabIndexMap[ index ];
    var target = "li:eq(" + tabIndex + ")";
    $("#editor-pane-nav li").attr("class", "");
    $( "#editor-pane-nav " + target + " a" ).tab( "show" );
    $('.selected').html($("#editor-pane-nav " + target + " a").text());
    $('.mouseoverbuttontext').html($("#editor-pane-nav " + target + " p").text());
    editor.focus();
    editor.resize(true);
    editor.scrollToLine( line, true, true, function() {} );
    editor.gotoLine( line );
}


function getFilename(path) {
    if (!isValidFileList) return path;

    for (var i = 0; i < fileInfos.length; i++) {
        if (path.indexOf(fileInfos[i].path) != -1) {
            return fileInfos[i].path;
        }
    }
    for (var j = 0; j < fileInfos.length; j++) {
        if (path.indexOf(fileInfos[j].name) != -1) {
            return fileInfos[j].name;
        }
    }
}

function
warn(condition, message) {
    if (!condition) {
        console.log("WARNING: " + (message || ("Assertion Failed.")));
    }
}

function addLMemTree() {
    // Generate the Javascript datastructure for the local memory
    var memList = [];
    var lmemList = []; // Stores list of local memories

    // If there are local memories to render, then add it to the fancytree:
    if (lmvData.nodes.length !== 0) {
        // Iterate through the mavJSON
        lmvData.nodes.forEach(function (element) {
            // Check whether it's either a kernel (OpenCL) or component (HLS)
            if (element.type == "kernel" || element.type == "component") {
                var kernelName = element.name;
                var kernelEntry = { title: kernelName, isLmem: false, expanded: true, icon: "lib/fancytree/skin-win8/kernelicon.png", children: [] };
                // Find the local memory block
                element.children.forEach(function (node) {
                    if (node.type == "memtype" && node.name == "Local Memory") {
                        // Add all the local memories
                        node.children.forEach(function (lmemNode) {
                            var memEntry = { title: lmemNode.name, kernel: kernelName, isLmem: true, expanded: true, icon: "lib/fancytree/skin-win8/memicon.png", children: [] };
                            lmemNode.children.forEach(function (bankNode) {
                                var bankName = "<input id='" + kernelName + "_" + lmemNode.name + "_" + bankNode.name +
                                    "'  type='checkbox' checked='checked' name='" + bankNode.name + "' data-kernel='" + kernelName + "' data-lmem='" + lmemNode.name +
                                    "' value='' onClick='startGraphForBank(this)'>" + bankNode.name;
                                var bankEntry = { title: bankName, bank: bankNode.name, lmem: lmemNode.name, kernel: kernelName, isLmem: false, isBank: true, expanded: true, icon: false };
                                memEntry.children.push(bankEntry);
                            });
                            kernelEntry.children.push(memEntry);
                        });
                    }
                });
                memList.push(kernelEntry);
            }
        });

        // If there are local memories to render, then add it to the fancytree:

        $("#lmem-tree").fancytree({
            checkbox: false,
            source: memList,
            icon: true, // Disable the default icons
            clickFolderMode: 3, // 1:activate, 2:expand, 3:activate and expand, 4:activate (dblclick expands)
            activate: function (event, data) {
                // Check if a local memory is selected (do nothing for kernel)
                if (data.node.data.isLmem || data.node.data.isBank) {
                    var lmem_name, kernel_name, bank_name;
                    if (data.node.data.isLmem) {
                        lmem_name = data.node.title;
                    } else {
                        lmem_name = data.node.data.lmem;
                        bank_name = data.node.data.bank;
                    }
                    // Pass the name of the local memory into the rendering
                    kernel_name = data.node.data.kernel;

                    // Get the list of banks for that node that's selected
                    var bankElements = document.querySelectorAll('[id^="' + kernel_name + '_' + lmem_name + '"]');
                    var bankList = [];

                    // TODO: Find a way to add the checked:true filter within the query instead of doing a for loop
                    // Avoid using forEach on bankElements here because IE/Edge does not support it.
                    for (var i=0; i < bankElements.length; i++) {
                        if (bankElements[i].checked === true) bankList.push(bankElements[i].name);
                    }

                    // Start a new graph
                    if (isValidMemoryViewer) {
                        $('#LMEMG').html("");
                        lmem_graph = new StartGraph(lmvData, "LMEM", kernel_name, lmem_name, bankList, bank_name);
                        lmem_graph.refreshGraph();
                    }
                }
            }
        });

        return true;
    } else {
        return false;
    }
}

function startGraphForBank(element) {
    var kernelName = element.getAttribute("data-kernel");
    var lmemName = element.getAttribute("data-lmem");
    var bankName = element.getAttribute("name");

    var bankElements = document.querySelectorAll('[id^="' + kernelName + '_' + lmemName + '"]');
    var bankList = [];

    bankElements.forEach(function (elem) {
        if (elem.checked === true) bankList.push(elem.name);
    });

    if (isValidMemoryViewer) {
        $('#LMEMG').html("");
        lmem_graph = new StartGraph(lmvData, "LMEM", kernelName, lmemName, bankList, bankName);
        lmem_graph.refreshGraph();
    }

}

function addComponentTree() {
    // Generate the Javascript data structure for the components
    var compList = []; // List of components

    // If there are components to render, then add it to the fancytree:
    if (mavData.nodes.length !== 0) {
        // Iterate through the mavJSON
        mavData.nodes.forEach(function (element) {
            if (element.type == "kernel" || element.type == "component") {
                var compName = element.name;
                var compEntry = { title: compName, icon: "lib/fancytree/skin-win8/kernelicon.png"};
                compList.push(compEntry);
            }
        });

        // If there are local memories to render, then add it to the fancytree:

        $("#comp-tree").fancytree({
            checkbox: false,
            source: compList,
            icon: true, // Disable the default icons
            clickFolderMode: 3, // 1:activate, 2:expand, 3:activate and expand, 4:activate (dblclick expands)
            activate: function (event, data) {
                var comp_name = data.node.title;

                // Pass the name of the component into the rendering
                if (isValidSystemViewer) {
                    $('#CSPG').html("");
                    cspv_graph = new StartGraph(mavData, "CSPV", comp_name);
                    cspv_graph.refreshGraph();
                }
            }

        });

        return true;
    } else {
        return false;
    }
}
