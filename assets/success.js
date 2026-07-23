if (sessionStorage.getItem("facilitaPaid") !== "true" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  location.replace("/facilita/?etapa=summary");
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = document.getElementById("successStageLoader");
const loadingText = document.getElementById("successLoadingText");
const content = document.getElementById("successContent");
const processItems = Array.from(document.querySelectorAll(".process-item"));
const timing = reducedMotion ? 0 : 650;

setTimeout(() => {
  loadingText.textContent = "Registrando a confirmação";
}, timing);

setTimeout(() => {
  loadingText.textContent = "Organizando os próximos passos";
}, timing * 2);

setTimeout(() => {
  loader.classList.add("finished");
  content.classList.add("visible");
  content.setAttribute("aria-hidden", "false");
}, timing * 3);

processItems.forEach((item, index) => {
  setTimeout(() => {
    item.classList.add("visible");
    item.setAttribute("aria-hidden", "false");
  }, timing * (4 + index));
});
