import PyodideVisualizer from './PyodideVisualizer.js';

// Initialize Ace Editor
const editor = ace.edit("editor");
editor.setTheme("ace/theme/github");
editor.session.setMode("ace/mode/python");
editor.setValue(`class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next
        
n3 = Node(3)
n2 = Node(2, n3)
n1 = Node(1, n2)

head = n1`, 1)

document.getElementById('editor').style.fontSize='16px';

// Initialize JSAV
//const visualizer = new Visualizer(editor); 


let vizBtn = document.getElementById("visualizeBtn");

let codeExamples = {

"sumOfArray": `arr = [1, 2, 3, 4]
total = 0

for x in arr:
    total += x

print(total)`,

"minMax": `arr = [7, 2, 9, 4, 1]

mn = arr[0]
mx = arr[0]

for x in arr:
    if x < mn:
        mn = x
    if x > mx:
        mx = x

print(mn, mx)
`,

"listMut": `def change(arr):
    arr[0] = 99

nums = [1, 2, 3]
change(nums)

print(nums)
`,
"freqMap": `words = ["cat", "dog", "cat", "bird", "dog"]
freq = {}

for w in words:
    if w in freq:
        freq[w] += 1
    else:
        freq[w] = 1

print(freq)`,
"llistTraverse":`class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

n3 = Node(3)
n2 = Node(2, n3)
n1 = Node(1, n2)

curr = n1
while curr:
    print(curr.val)
    curr = curr.next`,
"objects": ``,
"nestedObjects": ``
}

document.getElementById("examples").onchange = function() {
    const example = this.value;
    editor.setValue(codeExamples[example], 1); 
}

document.getElementById("language").onchange = function() {
    const lang = this.value;
    if(lang != "python"){
        alert("Only Python is supported currently.");
        this.value = "python";
    }    
}
let canVisualize = true;
// Visualization logic (placeholder)
//const visualizer = new SkulptVisualizer(editor);
const visualizer = new PyodideVisualizer(editor);
vizBtn.onclick = function() {
    if(canVisualize){
        const code = editor.getValue();
        visualizer.visualize(code);
        editor.setReadOnly(true);
        vizBtn.innerText = "Edit";
        vizBtn.style.backgroundColor = "#7f7aadff";
        canVisualize = false;
    
        return;
        const chars = new antlr4.InputStream(code);
        const lexer = new Python3Lexer(chars);
        const tokens = new antlr4.CommonTokenStream(lexer);
        const parser = new Python3Parser(tokens);
        parser.buildParseTrees = true;

        const tree = parser.file_input(); // your start rule

        const listener = new PythonCheckerListener();
        const walker = new antlr4.tree.ParseTreeWalker();
        walker.walk(listener, tree);

        //const out = checker.visit(tree);

        console.log(listener.instructions);
        const executer = new Executer();
        executer.execute(listener.instructions);

        console.log(executer.envSnaps);

        visualizer.visualize(executer.envSnaps, editor); 

        vizBtn.innerText = "Edit";
        vizBtn.style.backgroundColor = "#7f7aadff";
        canVisualize = false;
        editor.setReadOnly(true);

    }else{
        vizBtn.innerText = "Visualize";
        vizBtn.style.backgroundColor = "#4CAF50";
        canVisualize = true;
        editor.setReadOnly(false);
        visualizer.reset();
    }
};
