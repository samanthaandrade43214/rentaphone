document.getElementById("backToRequest").addEventListener("click", (event) => {
  event.preventDefault();
  if (history.length > 1) {
    history.back();
    return;
  }
  location.href = "/facilita/?etapa=approved";
});
