(() => {
  const humanCheck = document.getElementById("humanCheck");
  const continueButton = document.getElementById("continueButton");

  humanCheck.addEventListener("click", () => {
    if (humanCheck.classList.contains("validating")) return;
    if (humanCheck.getAttribute("aria-pressed") === "true") {
      humanCheck.classList.remove("checked");
      humanCheck.setAttribute("aria-pressed", "false");
      continueButton.disabled = true;
      return;
    }

    humanCheck.classList.add("validating");
    humanCheck.setAttribute("aria-busy", "true");
    humanCheck.querySelector(".human-check-copy strong").textContent = "Validando acesso";
    humanCheck.querySelector(".human-check-copy span").textContent = "Aguarde alguns instantes";

    setTimeout(() => {
      humanCheck.classList.remove("validating");
      humanCheck.classList.add("checked");
      humanCheck.setAttribute("aria-busy", "false");
      humanCheck.setAttribute("aria-pressed", "true");
      humanCheck.querySelector(".human-check-copy strong").textContent = "Acesso validado";
      humanCheck.querySelector(".human-check-copy span").textContent = "Você pode continuar";
      continueButton.disabled = false;
      continueButton.focus();
    }, 1700);
  });

  continueButton.addEventListener("click", () => {
    sessionStorage.setItem("facilitaHumanVerified", "true");
    location.href = "/facilita/";
  });
})();
