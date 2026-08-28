async function boot() {
  const session = await requireSession("index.html");
  if (!session) return;
  const profile = await fetchMyProfile();
  if (!profile || !profile.is_admin) { window.location.href = "dashboard.html"; return; }
  await loadOrders();
}
boot();

async function loadOrders() {
  const body = document.getElementById("ordersBody");
  const { data, error } = await supabaseClient
    .from("withdrawals")
    .select("id, amount, gift_type, message, target_username, status, created_at, requester:profiles!withdrawals_user_id_fkey(username)")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = `<tr><td colspan="8" class="error-text">Ошибка загрузки: ${error.message}</td></tr>`;
    return;
  }
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="8" class="hint-text">Заявок пока нет.</td></tr>`;
    return;
  }

  body.innerHTML = data.map((w) => `
    <tr data-id="${w.id}">
      <td>${new Date(w.created_at).toLocaleString("ru-RU")}</td>
      <td>@${w.requester?.username ?? "—"}</td>
      <td>@${w.target_username}</td>
      <td class="amt">★ ${w.amount}</td>
      <td>${w.gift_type === "mishka" ? "🧸 Мишка" : "❤️ Сердце"}</td>
      <td>${w.message ? escapeHtml(w.message) : "<span class='hint-text'>—</span>"}</td>
      <td><span class="status-pill ${w.status === "confirmed" ? "status-confirmed" : "status-pending"}">
        ${w.status === "confirmed" ? "выполнено" : "в ожидании"}
      </span></td>
      <td>
        ${w.status === "pending"
          ? `<button class="btn btn-gold btn-sm confirm-btn">Подтвердить</button>`
          : ""}
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".confirm-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      const id = row.dataset.id;
      btn.disabled = true;
      btn.textContent = "…";
      const { error } = await supabaseClient.rpc("admin_confirm_withdrawal", { p_withdrawal_id: id });
      if (error) { alert("Ошибка: " + error.message); btn.disabled = false; btn.textContent = "Подтвердить"; return; }
      await loadOrders();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
