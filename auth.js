// ---------- modal open/close plumbing ----------
function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

document.getElementById("openLogin")?.addEventListener("click", () => openModal("loginVeil"));
document.getElementById("openRegister")?.addEventListener("click", () => openModal("registerVeil"));
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-veil").forEach((veil) => {
  veil.addEventListener("click", (e) => { if (e.target === veil) closeModal(veil.id); });
});

// ---------- code input auto-advance helper ----------
function wireCodeInputs(selector) {
  const inputs = Array.from(document.querySelectorAll(selector));
  inputs.forEach((input, i) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);
      if (input.value && inputs[i + 1]) inputs[i + 1].focus();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && inputs[i - 1]) inputs[i - 1].focus();
    });
    input.addEventListener("paste", (e) => {
      const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "");
      if (!text) return;
      e.preventDefault();
      text.split("").slice(0, inputs.length).forEach((ch, idx) => { if (inputs[idx]) inputs[idx].value = ch; });
      inputs[Math.min(text.length, inputs.length) - 1]?.focus();
    });
  });
  return () => inputs.map((i) => i.value).join("");
}
const readLoginCode = wireCodeInputs(".code-digit");
const readRegCode = wireCodeInputs(".code-digit-reg");

// ======================================================
// LOGIN
// ======================================================
let loginEmail = "";

document.getElementById("loginEmailForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginEmailError");
  errEl.textContent = "";
  loginEmail = document.getElementById("loginEmail").value.trim();

  const { error } = await supabaseClient.auth.signInWithOtp({
    email: loginEmail,
    options: { shouldCreateUser: false },
  });
  if (error) {
    errEl.textContent = error.message.includes("not found") || error.status === 400
      ? "Аккаунт с такой почтой не найден. Зарегистрируйтесь."
      : "Не получилось отправить код: " + error.message;
    return;
  }
  document.getElementById("loginEmailShown").textContent = loginEmail;
  document.getElementById("loginStep1").hidden = true;
  document.getElementById("loginStep2").hidden = false;
});

document.getElementById("loginCodeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginCodeError");
  errEl.textContent = "";
  const token = readLoginCode();
  if (token.length !== 6) { errEl.textContent = "Введите все 6 цифр кода."; return; }

  const { error } = await supabaseClient.auth.verifyOtp({ email: loginEmail, token, type: "email" });
  if (error) { errEl.textContent = "Неверный или устаревший код."; return; }

  window.location.href = "dashboard.html";
});

// ======================================================
// REGISTER
// ======================================================
let regEmail = "";

document.getElementById("regEmailForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("regEmailError");
  errEl.textContent = "";
  regEmail = document.getElementById("regEmail").value.trim();

  const { error } = await supabaseClient.auth.signInWithOtp({
    email: regEmail,
    options: { shouldCreateUser: true },
  });
  if (error) { errEl.textContent = "Не получилось отправить код: " + error.message; return; }

  document.getElementById("regEmailShown").textContent = regEmail;
  document.getElementById("regStep1").hidden = true;
  document.getElementById("regStep2").hidden = false;
});

document.getElementById("regCodeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("regCodeError");
  errEl.textContent = "";
  const token = readRegCode();
  if (token.length !== 6) { errEl.textContent = "Введите все 6 цифр кода."; return; }

  const { error } = await supabaseClient.auth.verifyOtp({ email: regEmail, token, type: "email" });
  if (error) { errEl.textContent = "Неверный или устаревший код."; return; }

  // Already has a profile (e.g. re-registering an existing account)? Skip straight in.
  const existing = await fetchMyProfile();
  if (existing) { window.location.href = "dashboard.html"; return; }

  document.getElementById("regStep2").hidden = true;
  document.getElementById("regStep3").hidden = false;
});

document.getElementById("regUsernameForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("regUsernameError");
  errEl.textContent = "";
  const username = document.getElementById("regUsername").value.trim();

  const { data: { user } } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from("profiles").insert({ id: user.id, username });

  if (error) {
    errEl.textContent = error.code === "23505"
      ? "Этот юзернейм уже занят, придумайте другой."
      : "Ошибка: " + error.message;
    return;
  }
  window.location.href = "dashboard.html";
});
