document.addEventListener("DOMContentLoaded", () => {

    const modal = document.getElementById("profile-edit-modal");
    const openBtn = document.getElementById("open-profile-edit");
    const closeBtn = document.getElementById("close-profile-edit");
    const cancelBtn = document.getElementById("cancel-profile-edit");
    const form = document.getElementById("profile-edit-form");
  
    /* --------------------
       モーダル開閉
    -------------------- */
    function openModal() {
      modal.classList.remove("is-hidden");
  
      // 現在の表示をフォームに反映
      document.getElementById("edit-name").value =
        document.getElementById("display-name").textContent;
  
      document.getElementById("edit-email").value =
        document.getElementById("display-email").textContent;
  
      document.getElementById("edit-base").value =
        document.getElementById("display-base").textContent.replace("拠点：", "");
  
      document.getElementById("edit-interests").value =
        document.getElementById("display-interests").textContent.replace("興味：", "");
  
      document.getElementById("edit-theme").value =
        document.getElementById("display-theme").textContent.replace("テーマ：", "");
    }
  
    function closeModal() {
      modal.classList.add("is-hidden");
    }
  
    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  
  
    /* --------------------
       保存処理
    -------------------- */
    form.addEventListener("submit", (e) => {
      e.preventDefault();
  
      const name = document.getElementById("edit-name").value.trim();
      const email = document.getElementById("edit-email").value.trim();
      const base = document.getElementById("edit-base").value.trim();
      const interests = document.getElementById("edit-interests").value.trim();
      const theme = document.getElementById("edit-theme").value.trim();
  
      document.getElementById("display-name").textContent = name;
      document.getElementById("display-email").textContent = email;
      document.getElementById("display-base").textContent = "拠点：" + base;
      document.getElementById("display-interests").textContent = "興味：" + interests;
      document.getElementById("display-theme").textContent = "テーマ：" + theme;
  
      // アイコン頭文字
      const initial = name.charAt(0).toUpperCase() || "U";
      document.getElementById("display-avatar-initial").textContent = initial;
      document.getElementById("edit-avatar-initial").textContent = initial;
  
      // テーマ反映
      applyTheme(theme);
  
      closeModal();
    });
  
  
    /* --------------------
       テーマ切替
    -------------------- */
    function applyTheme(theme) {
      if (theme === "ダーク") {
        document.body.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.body.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    }
  
    // ページ読み込み時：前回のテーマを適用
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark");
      document.getElementById("display-theme").textContent = "テーマ：ダーク";
    }
  
  });
  