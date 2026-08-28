let profile = null;

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }
document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
document.querySelectorAll(".modal-veil").forEach((veil) => veil.addEventListener("click", (e) => { if (e.target === veil) closeModal(veil.id); }));

async function boot() {
  const session = await requireSession("index.html");
  if (!session) return;
  profile = await fetchMyProfile();
  if (!profile) { window.location.href = "index.html"; return; }
  renderProfile();
}
boot();

function renderProfile() {
  document.getElementById("balanceValue").textContent = profile.balance;
  document.getElementById("usernameValue").textContent = "@" + profile.username;
  document.getElementById("adminLink").style.display = profile.is_admin ? "inline-flex" : "none";
}

document.getElementById("adminLink").addEventListener("click", () => { window.location.href = "admin.html"; });
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

// ======================================================
// WITHDRAW WIZARD
// ======================================================
let wAmount = null, wGift = null;

document.querySelectorAll(".amount-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".amount-opt").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    wAmount = Number(btn.dataset.amount);
  });
});

document.getElementById("wStep1Next").addEventListener("click", () => {
  const err = document.getElementById("wAmountError");
  if (!wAmount) { err.textContent = "Выберите сумму."; return; }
  if (profile.balance < wAmount) { err.textContent = "Недостаточно звёзд на балансе."; return; }
  err.textContent = "";
  document.getElementById("wStep1").hidden = true;
  document.getElementById("wStep2").hidden = false;
});

document.querySelectorAll(".gift-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gift-opt").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    wGift = btn.dataset.gift;
  });
});

document.getElementById("wStep2Next").addEventListener("click", () => {
  const err = document.getElementById("wGiftError");
  if (!wGift) { err.textContent = "Выберите подарок."; return; }
  err.textContent = "";
  document.getElementById("wStep2").hidden = true;
  document.getElementById("wStep3").hidden = false;
});

document.getElementById("wFinalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("wFinalError");
  err.textContent = "";
  const target = document.getElementById("wTarget").value.trim();
  const message = document.getElementById("wMessage").value.trim();

  const { data, error } = await supabaseClient.rpc("create_withdrawal", {
    p_amount: wAmount,
    p_gift_type: wGift,
    p_message: message,
    p_target_username: target,
  });

  if (error) {
    const map = {
      insufficient_balance: "Недостаточно звёзд на балансе.",
      target_not_found: "Такой юзернейм не найден.",
      invalid_amount: "Недопустимая сумма.",
    };
    err.textContent = map[error.message] || ("Ошибка: " + error.message);
    return;
  }

  profile.balance -= wAmount;
  renderProfile();
  document.getElementById("wStep3").hidden = true;
  document.getElementById("wStep4").hidden = false;
});

document.getElementById("openWithdraw").addEventListener("click", () => {
  wAmount = null; wGift = null;
  document.querySelectorAll(".amount-opt, .gift-opt").forEach((b) => b.classList.remove("selected"));
  document.getElementById("wMessage").value = "";
  document.getElementById("wTarget").value = "";
  ["wStep1", "wStep2", "wStep3", "wStep4"].forEach((id, i) => document.getElementById(id).hidden = i !== 0);
  openModal("withdrawVeil");
});

// ======================================================
// HISTORY
// ======================================================
document.getElementById("openHistory").addEventListener("click", async () => {
  openModal("historyVeil");
  const list = document.getElementById("historyList");
  list.innerHTML = '<p class="hint-text">Загрузка…</p>';

  const { data, error } = await supabaseClient
    .from("withdrawals")
    .select("id, amount, gift_type, target_username, status, created_at")
    .order("created_at", { ascending: false });

  if (error) { list.innerHTML = '<p class="error-text">Не удалось загрузить историю.</p>'; return; }
  if (!data.length) { list.innerHTML = '<p class="hint-text">Пока нет заявок на вывод.</p>'; return; }

  list.innerHTML = data.map((w) => `
    <div class="history-row">
      <div>
        <span class="amt">★ ${w.amount}</span>
        <span class="hint-text"> → @${w.target_username} · ${w.gift_type === "mishka" ? "🧸" : "❤️"}</span>
      </div>
      <span class="status-pill ${w.status === "confirmed" ? "status-confirmed" : "status-pending"}">
        ${w.status === "confirmed" ? "выполнено" : "в ожидании"}
      </span>
    </div>
  `).join("");
});

// ======================================================
// PROMO CODE
// ======================================================
function wirePromoOpen(btnId) {
  document.getElementById(btnId).addEventListener("click", () => {
    document.getElementById("promoInput").value = "";
    document.getElementById("promoError").textContent = "";
    document.getElementById("promoSuccess").textContent = "";
    openModal("promoVeil");
  });
}
wirePromoOpen("openPromoTop");
wirePromoOpen("openPromoBottom");

document.getElementById("promoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("promoError");
  const ok = document.getElementById("promoSuccess");
  err.textContent = ""; ok.textContent = "";
  const code = document.getElementById("promoInput").value.trim().toUpperCase();

  const { data, error } = await supabaseClient.rpc("redeem_promo_code", { p_code: code });

  if (error) {
    const map = {
      already_redeemed: "Вы уже использовали этот промокод.",
      limit_reached: "Лимит активаций этого промокода исчерпан.",
      not_found: "Такой промокод не найден.",
    };
    err.textContent = map[error.message] || ("Ошибка: " + error.message);
    return;
  }

  profile = await fetchMyProfile();
  renderProfile();
  ok.textContent = data?.bonus_balance
    ? `Готово! Начислено ★ ${data.bonus_balance}.`
    : "Промокод применён!";
});
