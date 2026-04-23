
let topZ = 10;

function bringToFront(win) {
  topZ++;
  win.style.zIndex = topZ;
}

function makeDraggable(win) {

  const bar = win.querySelector(".title-bar");

  let offsetX, offsetY;

  bar.addEventListener("mousedown", (e) => {

    bringToFront(win);
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;

    function move(e) {
      win.style.left = (e.clientX - offsetX) + "px";
      win.style.top = (e.clientY - offsetY) + "px";
    }

    function stop() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);

  });

}
document.querySelectorAll(".window").forEach(win => {

  win.addEventListener("mousedown", () => {
    bringToFront(win);
  });

});
document.querySelectorAll(".window").forEach(makeDraggable);