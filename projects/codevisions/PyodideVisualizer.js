export default class Visualizer {
    constructor(editor) {
        this.editor = editor;

        let viz = document.getElementById("stackArea");
        this.domStackTable = document.getElementById("stackTable");
        this.domHeapArea = document.getElementById("heapArea");
        this.domStackTable.innerHTML = `<tr><th colspan=2>Call Stack</th></tr>`;
        this.envSnaps = [];

        this.prevButton = document.getElementById("prevStepBtn");
        this.nextButton = document.getElementById("nextStepBtn");
        this.firstButton = document.getElementById("firstStepBtn");
        this.lastButton = document.getElementById("lastStepBtn");

        this.vizMsg = document.getElementById("vizMsg");

        this.snapCounter = 0;
        this.nextButton.onclick = () => { if (this.canVisualize) this.nextSnap(); };
        this.prevButton.onclick = () => { if (this.canVisualize) this.prevSnap(); };
        this.firstButton.onclick = () => { if (this.canVisualize) this.renderSnap(this.envSnaps[0]); };
        this.lastButton.onclick = () => { if (this.canVisualize) this.renderSnap(this.envSnaps[this.envSnaps.length - 1]);};
        this.slider = document.getElementById("stepSlider");
        //this.slider.oninput = (e) => { this.renderSnap(this.envSnaps[e.target.value]); };
        this.editor = editor;

        this.initPyodide();

        this.renderedRefs = {};
    }

    async initPyodide() {
        // Show overlay
        document.getElementById("loadingOverlay").style.display = "flex";

        this.pyodide = await loadPyodide();

        // Hide overlay
        document.getElementById("loadingOverlay").style.display = "none";
    }

    async visualize(code) {
        this.reset();
        this.outputDiv = document.getElementById("vizOutput");
        this.outputDiv.innerText = "";


        this.pyodide.globals.set("trace_callback", (data) => {
            const snap = JSON.parse(data);
            const prevOutput = this.envSnaps.length ? (this.envSnaps[this.envSnaps.length - 1].output || "") : "";
            snap.output = prevOutput + (snap.event === "print" ? (snap.value + "\n") : "");
            this.envSnaps.push(snap);
        });

        const tracerPythonCode = `
import sys, json, textwrap, builtins


def __trace_print__(*args, **kwargs):
    value = " ".join(str(a) for a in args)
    builtins.print(*args, **kwargs)
    frame = sys._getframe(1)
    sanitized = sanitize(frame.f_locals, frame.f_globals)
    trace_callback(json.dumps({
        "event": "print",
        "value": value,
        "line": frame.f_lineno,
        "locals": sanitized.get("locals", {}),
        "globals": sanitized.get("globals", {}),
        "refs": sanitized.get("refs", {})
    }))

def sanitize(locals_env, globals_env=None):
    id_to_ref = {}
    refs = {}
    counter = {"n": 0}

    def new_ref_id():
        counter["n"] += 1
        return f"o{counter['n']}"

    def _sanitize_value(v, depth=0):
        if isinstance(v, (int, float, str, bool, type(None))):
            return v
        if depth > 6:
            return repr(v)

        vid = id(v)
        if vid in id_to_ref:
            return {"__ref__": id_to_ref[vid]}

        rid = new_ref_id()
        id_to_ref[vid] = rid
        clsname = getattr(v, "__class__", type(v)).__name__

        try:
            if isinstance(v, dict):
                content = {}
                refs[rid] = {"__id__": rid, "__class__": "dict", "value": content}
                for kk, vv in v.items():
                    try:
                        content[str(kk)] = _sanitize_value(vv, depth + 1)
                    except Exception:
                        content[str(kk)] = repr(vv)
                return {"__ref__": rid}

            if isinstance(v, (list, tuple, set)):
                items = []
                refs[rid] = {"__id__": rid, "__class__": clsname, "value": items}
                for x in v:
                    try:
                        items.append(_sanitize_value(x, depth + 1))
                    except Exception:
                        items.append(repr(x))
                return {"__ref__": rid}

            if callable(v) or isinstance(v, type):
                refs[rid] = {"__id__": rid, "__class__": clsname, "repr": repr(v)}
                return {"__ref__": rid}

            attrs = getattr(v, "__dict__", None)
            if isinstance(attrs, dict):
                content = {"__class__": clsname}
                refs[rid] = {"__id__": rid, "__class__": clsname, "attrs": content}
                for kk, vv in attrs.items():
                    if kk.startswith("__"):
                        continue
                    try:
                        content[kk] = _sanitize_value(vv, depth + 1)
                    except Exception:
                        content[kk] = repr(vv)
                return {"__ref__": rid}

            refs[rid] = {"__id__": rid, "__class__": clsname, "repr": repr(v)}
            return {"__ref__": rid}
        except Exception:
            return repr(v)

    locals_out = {}
    for k, v in (locals_env or {}).items():
        if k.startswith("__"):
            continue
        try:
            locals_out[k] = _sanitize_value(v)
        except Exception:
            locals_out[k] = repr(v)

    globals_out = {}
    if globals_env is not None:
        for k, v in globals_env.items():
            if k.startswith("__"):
                continue
            try:
                globals_out[k] = _sanitize_value(v)
            except Exception:
                globals_out[k] = repr(v)

    return {"locals": locals_out, "globals": globals_out, "refs": refs}

def tracer(frame, event, arg):
    if frame.f_code.co_filename != "<user_code>":
        return tracer

    sanitized = sanitize(frame.f_locals, frame.f_globals)
    data = {
        "event": event,
        "line": frame.f_lineno,
        "locals": sanitized.get("locals", {}),
        "globals": sanitized.get("globals", {}),
        "refs": sanitized.get("refs", {}),
    }
    if event == "return":
        data["return"] = repr(arg)

    trace_callback(json.dumps(data))
    return tracer

user_code = """${code}"""

code = compile(textwrap.dedent(user_code), "<user_code>", "exec")

sys.settrace(tracer)
try:
    exec(code, {"print": __trace_print__})
finally:
    sys.settrace(None)
`;

        await this.pyodide.runPythonAsync(tracerPythonCode);

        this.canVisualize = true;
        this.snapCounter = 0;
        this.slider.max = this.envSnaps.length - 1;
        this.slider.value = 0;
        this.slider.step = 1;
        this.slider.oninput = (e) => {
            this.snapCounter = parseInt(e.target.value);
            this.renderSnap(this.envSnaps[this.snapCounter]);
        }
        this.renderSnap(this.envSnaps[0]);
    }

    initVisualization() {
        this.domStackTable.innerHTML = `<tr><th colspan=2>Call Stack</th></tr>`;
        this.domHeapArea.innerHTML = "";
        this.vizMsg.innerText = "";
        document.getElementById("stepCounter").innerText = `Step 0 of 0`;
        this.editor.session.removeMarker(this.currentMarker);
        document.getElementById("vizOutput").innerText = "";
        this.clearArrows();
    }


    nextSnap() {
        if (this.snapCounter < this.envSnaps.length - 1) {
            this.snapCounter += 1;
            this.renderSnap(this.envSnaps[this.snapCounter]);
        }
    }

    prevSnap() {
        if (this.snapCounter > 0) {
            this.snapCounter -= 1;
            this.renderSnap(this.envSnaps[this.snapCounter]);
        }
    }


    reset() {
        this.canVisualize = false;
        this.snapCounter = 0;
        this.initVisualization();
        this.currentMarker = null;
        this.envSnaps = [];
    }

    getRelativePos(elem, container) {
        const elemRect = elem.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        return {
            x: elemRect.left - contRect.left + elemRect.width / 2,
            y: elemRect.top - contRect.top + elemRect.height / 2
        };
    }

    drawArrow(from, fromDir, to, toDir) {
        // Backwards-compat: drawArrow(a,b) -> from=a, fromDir='center', to=b, toDir='left'
        if (typeof to === 'undefined') {
            to = fromDir;
            fromDir = 'center';
            toDir = 'left';
        }

        const svg = document.getElementById("arrowLayer");
        const svgRect = svg.getBoundingClientRect();
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();

        function anchorPoint(rect, dir) {
            switch (dir) {
                case 'left':
                    return { x: rect.left - svgRect.left, y: rect.top - svgRect.top + rect.height / 2 };
                case 'right':
                    return { x: rect.right - svgRect.left, y: rect.top - svgRect.top + rect.height / 2 };
                case 'top':
                    return { x: rect.left - svgRect.left + rect.width / 2, y: rect.top - svgRect.top };
                case 'bottom':
                    return { x: rect.left - svgRect.left + rect.width / 2, y: rect.bottom - svgRect.top };
                case 'center':
                default:
                    return { x: rect.left - svgRect.left + rect.width / 2, y: rect.top - svgRect.top + rect.height / 2 };
            }
        }

        const start = anchorPoint(fromRect, fromDir || 'center');
        const end = anchorPoint(toRect, toDir || 'left');

        const midX = (start.x + end.x) / 2;
        const cp1 = { x: midX, y: start.y };
        const cp2 = { x: midX, y: end.y };

        const pathData = `M ${start.x} ${start.y} C ${cp1.x + (toDir == 'right' ? 50 : 0)} ${cp1.y}, ${cp2.x + (toDir == 'right' ? 50 : 0)} ${cp2.y}, ${end.x} ${end.y}`;

        svg.innerHTML += `<path d="${pathData}" fill="none" stroke="red" stroke-width="2" marker-end="url(#arrowhead)"></path>`;

        if (!document.getElementById("arrowhead")) {
            svg.innerHTML += `<defs>
            <marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
                <polygon points="0 0, 5 2.5, 0 5" fill="red"></polygon>
            </marker>
            </defs>`;
        }

        // Draw a small circle at the start of the arrow
        svg.innerHTML += `<circle cx="${start.x}" cy="${start.y}" r="2" fill="red"></circle>`;
    }

    clearArrows() {
        const svg = document.getElementById("arrowLayer");
        svg.innerHTML = "";
    }

    renderArray(arr) {
        const tbl = document.createElement("table");
        tbl.className = "vizObj";
        const row = document.createElement("tr");
        for (const elem of arr) {
            const td = document.createElement("td");
            if (elem && typeof elem === "object" && elem.__ref__) {
                td.textContent = " ";
                td.dataset.ref = elem.__ref__;
            } else {
                try {
                    td.textContent = JSON.stringify(elem);
                } catch (e) {
                    td.textContent = String(elem);
                }
            }
            row.appendChild(td);
        }
        tbl.appendChild(row);
        this.domHeapArea.appendChild(tbl);

        return tbl;
    }

    renderObject(obj) {
        const tbl = document.createElement("table");
        tbl.className = "vizObj";
        for (const key in obj) {
            const row = document.createElement("tr");
            const keyTd = document.createElement("td");
            keyTd.textContent = key;
            const valTd = document.createElement("td");
            const v = obj[key];
            if (v && typeof v === "object" && v.__ref__) {
                valTd.textContent = v.__ref__;
                valTd.dataset.ref = v.__ref__;
            } else {
                try {
                    valTd.textContent = JSON.stringify(v);
                } catch (e) {
                    valTd.textContent = String(v);
                }
            }
            row.appendChild(keyTd);
            row.appendChild(valTd);
            tbl.appendChild(row);
        }
        this.domHeapArea.appendChild(tbl);
        return tbl;
    }

    renderClassObject(clsObj){
        const tbl = document.createElement("table");
        tbl.className = "vizObj";
        const headerRow = document.createElement("tr");
        const classTd = document.createElement("td");
        classTd.colSpan = 2;
        classTd.textContent = `${clsObj.__class__}`;
        headerRow.appendChild(classTd);
        tbl.appendChild(headerRow);

        switch(clsObj.__class__){
            case "list":
                return this.renderArray(clsObj.value);
            case "tuple":
                return this.renderArray(clsObj.value);
            case "dict":
                return this.renderObject(clsObj.value);
        }
        for (const key in clsObj.attrs) {
            if(key === "__class__") continue;
            const row = document.createElement("tr");
            const keyTd = document.createElement("td");
            keyTd.textContent = key;
            const valTd = document.createElement("td");
            // If this attribute is a reference to another object, mark it
            // with a data-ref attribute so we can draw arrows in a second pass.
            if (typeof clsObj.attrs[key] === "object" && clsObj.attrs[key] !== null && (clsObj.attrs[key].hasOwnProperty("__ref__") || clsObj.attrs[key].hasOwnProperty("__ref"))) {
                const refId = clsObj.attrs[key].__ref__ || clsObj.attrs[key].__ref;
                valTd.textContent = " ";
                valTd.dataset.ref = refId;
            } else if (typeof clsObj.attrs[key] === "object" && clsObj.attrs[key] !== null) {
                try {
                    valTd.textContent = JSON.stringify(clsObj.attrs[key]);
                } catch (e) {
                    valTd.textContent = String(clsObj.attrs[key]);
                }
            } else {
                valTd.textContent = String(clsObj.attrs[key]);
            }
            row.appendChild(keyTd);
            row.appendChild(valTd);
            tbl.appendChild(row);
        }
        this.domHeapArea.appendChild(tbl);
        return tbl;
    }

    detectJsonType(str) {
        if (typeof str !== "string") {
            throw new TypeError("Input must be a string");
        }

        try {
            const parsed = JSON.parse(str);

            if (Array.isArray(parsed)) {
                return "array";
            }

            if (parsed !== null && typeof parsed === "object") {
                return "obj";
            }

            return "value";
        } catch {
            // Not valid JSON → treat as plain value string
            return "value";
        }
    }
    
    renderStack(locals, globals, refs) {
        this.domStackTable.innerHTML = "";
        this.domStackTable.insertRow().innerHTML = `<tr><th colspan=2>Globals</th></tr>`;

        // reset rendered refs for this snapshot
        this.renderedRefs = {};

        // First pass: render all class/heap objects and remember their table elements
        for (const ref in refs) {
            const refValue = refs[ref];
            if (refValue.hasOwnProperty("__class__")) {
                if(refValue.__class__ === "function" || refValue.__class__ === "type")
                    continue;
                const renderedRef = this.renderClassObject(refValue);
                this.renderedRefs[ref] = renderedRef;
            }
        }

        // Second pass: draw arrows for any member cells that reference other refs
        for (const ref in refs) {
            const refValue = refs[ref];
            const tbl = this.renderedRefs[ref];
            if (!tbl) continue;

            // attributes
            if (refValue.attrs) {
                for (const k in refValue.attrs) {
                    const v = refValue.attrs[k];
                    if (v && typeof v === "object" && v.__ref__) {
                        const srcCell = tbl.querySelector(`td[data-ref="${v.__ref__}"]`);
                        const targetTbl = this.renderedRefs[v.__ref__];
                        if (srcCell && targetTbl) this.drawArrow(srcCell, "center", targetTbl, "right");
                    }
                }
            }

            // array-like values
            if (refValue.value && Array.isArray(refValue.value)) {
                for (const v of refValue.value) {
                    if (v && typeof v === "object" && v.__ref__) {
                        const srcCell = tbl.querySelector(`td[data-ref="${v.__ref__}"]`);
                        const targetTbl = this.renderedRefs[v.__ref__];
                        if (srcCell && targetTbl) this.drawArrow(srcCell, "center", targetTbl, "right");
                    }
                }
            }
        }

        // Render globals and draw arrows for globals pointing at heap objects
        for (const glbl in globals) {
            try {

                const name = glbl;
                const value = globals[glbl];
                // Skip if it's a function or type
                if(value.hasOwnProperty("__ref__")){
                    const refObj = refs[value.__ref__];
                    if(refObj.hasOwnProperty("__class__") && (refObj.__class__ === "function" || refObj.__class__ === "type"))
                        continue;
                }

                const row = this.domStackTable.insertRow();
                const nameCell = document.createElement("td");
                nameCell.textContent = name;
                const arrowCell = document.createElement("td");
                row.appendChild(nameCell);
                row.appendChild(arrowCell);
                if (value && typeof value === "object" && value.__ref__) {
                    const objTbl = this.renderedRefs[value.__ref__];
                    if (objTbl) this.drawArrow(arrowCell, "center", objTbl, "left");
                    else arrowCell.textContent = " ";
                } else {
                    arrowCell.textContent = String(value);
                }
            } catch (e) {
                throw e;
            }
        }

        // check if locals and globals have the same contents to avoid duplicate display
        if(JSON.stringify(locals) === JSON.stringify(globals))
            return;

        this.domStackTable.insertRow().innerHTML = `<tr><th colspan=2>Current Frame</th></tr>`;
        for (const loc in locals) {
            try {
                const name = loc;
                const value = locals[loc];
                const row = this.domStackTable.insertRow();
                const nameCell = document.createElement("td");
                nameCell.textContent = name;
                const arrowCell = document.createElement("td");
                row.appendChild(nameCell);
                row.appendChild(arrowCell);

                if (value && typeof value === "object" && value.__ref__) {
                    const objTbl = this.renderedRefs[value.__ref__];
                    if (objTbl) this.drawArrow(arrowCell, "center", objTbl, "left");
                    else arrowCell.textContent = " ";
                } else {
                    arrowCell.textContent = String(value);
                }
            } catch (e) {
                throw e;
            }
        }
    }
    renderSnap(snap) {
        this.initVisualization();
        document.getElementById("stepCounter").innerText = `Step ${this.snapCounter + 1} of ${this.envSnaps.length}`;
        console.log(snap);
        this.slider.value = this.snapCounter;
        this.snapCounter = parseInt(this.slider.value);

        // Draw Stack
        this.renderStack(snap.locals, snap.globals, snap.refs);

        // Highlight current line
        let marker = this.editor.session.addMarker(new ace.Range(snap.line - 1, 0, snap.line - 1, 1), "myMarker", "fullLine");
        if (this.currentMarker != null)
            this.editor.session.removeMarker(this.currentMarker);
        this.currentMarker = marker;

        // Show output for print statements
        document.getElementById("vizOutput").innerText = snap.output || "";
    }
}
