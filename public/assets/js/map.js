// /public/assets/js/pages/map.js
document.addEventListener("DOMContentLoaded", () => {
    // ==========================
    //  基本設定
    // ==========================
    const STYLE_URL = "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json";
    const JP_BOUNDS = [[121.5, 19.5], [153.5, 47.5]];
  
    const map = new maplibregl.Map({
      container: "map",
      style: STYLE_URL,
      center: [138.25, 36.2],
      zoom: 5,
      maxZoom: 22,
      maxBounds: JP_BOUNDS,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
  
    // ==========================
    //  状態（State）
    // ==========================
    // マーカーとポップアップは1つだけ
    let activeMarker = null;
    let activePopup = null;
    // プログラムから閉じるときに true にしておくフラグ
    let isProgrammaticClose = false;
  
    // ==========================
    //  DOM 取得
    // ==========================
    const sidePanel = document.getElementById("sidePanel");
    const menuBtn = document.getElementById("menuBtn");
    const sideCloseBtn = document.getElementById("sideCloseBtn");
  
    const viewSearch = document.getElementById("view-search");
    const viewList = document.getElementById("view-list");
    const viewChat = document.getElementById("view-chat");
  
    const roomListEl = document.getElementById("roomList");
    const chatRoomName = document.getElementById("chatRoomName");
    const chatBody = document.getElementById("chatBody");
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatBackBtn = document.getElementById("chatBackBtn");
  
    const modal = document.getElementById("roomModal");
    const backdrop = document.getElementById("modalBackdrop");
    const closeModalBtn = document.getElementById("closeModal");
    const cancelBtn = document.getElementById("cancelBtn");
    const roomForm = document.getElementById("roomForm");
    const roomPublic = document.getElementById("roomPublic");
    const pwRow = document.getElementById("pwRow");
    const roomPassword = document.getElementById("roomPassword");
    const roomLng = document.getElementById("roomLng");
    const roomLat = document.getElementById("roomLat");
  
    // ==========================
    //  ユーティリティ（地図マスク）
    // ==========================
    function ringArea(ring) {
      let s = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        s += (x2 - x1) * (y2 + y1);
      }
      return s;
    }
    const asCCW = (ring) => (ringArea(ring) < 0 ? ring : ring.slice().reverse());
    const asCW = (ring) => (ringArea(ring) > 0 ? ring : ring.slice().reverse());
  
    function extractJapanRings(geoCollection) {
      const rings = [];
      (geoCollection.geometries || []).forEach((g) => {
        if (g.type === "Polygon" && g.coordinates?.[0]) rings.push(g.coordinates[0]);
        if (g.type === "MultiPolygon") (g.coordinates || []).forEach((p) => p[0] && rings.push(p[0]));
      });
      return rings;
    }
  
    function buildInverseJapanMask(rings) {
      // 世界全体を外枠にして、日本を穴にするポリゴンを返す
      const world = asCCW([
        [-180, -90],
        [180, -90],
        [180, 90],
        [-180, 90],
        [-180, -90],
      ]);
      const holes = rings.map(asCW);
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [world, ...holes],
            },
          },
        ],
      };
    }
  
    // ==========================
    //  モーダル（部屋作成）
    // ==========================
    function openRoomModal(lng, lat) {
      roomLng.value = lng.toFixed(6);
      roomLat.value = lat.toFixed(6);
      modal.classList.add("active");
      backdrop.classList.add("active");
      document.getElementById("roomName").focus();
    }
  
    function closeRoomModal() {
      modal.classList.remove("active");
      backdrop.classList.remove("active");
      roomForm.reset();
      pwRow.style.display = "none";
      roomPassword.value = "";
    }
  
    roomPublic.addEventListener("change", () => {
      const isPublic = roomPublic.checked;
      pwRow.style.display = isPublic ? "none" : "grid";
      if (isPublic) roomPassword.value = "";
    });
  
    roomForm.addEventListener("submit", (e) => {
      e.preventDefault();
  
      const payload = {
        name: document.getElementById("roomName").value.trim(),
        description: document.getElementById("roomDesc").value.trim(),
        isPublic: roomPublic.checked,
        password: roomPublic.checked ? "" : roomPassword.value,
        lng: parseFloat(roomLng.value),
        lat: parseFloat(roomLat.value),
      };
  
      if (!payload.name) {
        alert("ルーム名を入力してください。");
        return;
      }
      if (!payload.isPublic && !payload.password) {
        alert("非公開の場合、パスワードを入力してください。");
        return;
      }
  
      console.log("✅ ルーム作成データ", payload);
      alert("サンプル：ルーム作成データをコンソールに出力しました。");
      closeRoomModal();
    });
  
    [closeModalBtn, cancelBtn, backdrop].forEach((el) => el.addEventListener("click", closeRoomModal));
  
    // ==========================
    //  サイドパネル
    // ==========================
    function openSidePanel() {
      sidePanel.classList.add("open");
    }
    function closeSidePanel() {
      sidePanel.classList.remove("open");
      sidePanel.classList.remove("chat-mode");
    }
  
    function showPanelView(name) {
      // 全部消す
      viewSearch.style.display = "none";
      viewList.style.display = "none";
      viewChat.style.display = "none";
  
      if (name === "search") viewSearch.style.display = "block";
      if (name === "list") viewList.style.display = "block";
      if (name === "chat") viewChat.style.display = "flex";
    }
  
    menuBtn.addEventListener("click", () => {
      if (sidePanel.classList.contains("open")) {
        closeSidePanel();
      } else {
        openSidePanel();
        showPanelView("list");
      }
    });
    sideCloseBtn.addEventListener("click", closeSidePanel);
  
    document.querySelectorAll(".side-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        showPanelView(view);
        if (view !== "chat") sidePanel.classList.remove("chat-mode");
      });
    });
  
    // ==========================
    //  ルーム一覧・チャット（ダミー）
    // ==========================
    const DUMMY_ROOMS = [
      { id: 1, name: "東京・観光情報交換ルーム", desc: "浅草・渋谷・新宿" },
      { id: 2, name: "沖縄ダイビング仲間募集", desc: "那覇・慶良間" },
      { id: 3, name: "北海道グルメ", desc: "札幌・小樽・函館" },
      { id: 4, name: "埼玉：四季彩ルート", desc: "長瀞・秩父" },
    ];
  
    function renderRoomList(rooms) {
      roomListEl.innerHTML = "";
      rooms.forEach((room) => {
        const li = document.createElement("li");
        li.className = "room-item";
        li.innerHTML = `
          <div class="room-item-title">${room.name}</div>
          <div class="room-item-desc">${room.desc || ""}</div>
        `;
        li.addEventListener("click", () => {
          chatRoomName.textContent = room.name;
          chatBody.innerHTML = `<div class="chat-msg chat-msg-other">${room.name} へようこそ！</div>`;
          showPanelView("chat");
          sidePanel.classList.add("chat-mode");
        });
        roomListEl.appendChild(li);
      });
    }
    renderRoomList(DUMMY_ROOMS);
  
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      const div = document.createElement("div");
      div.className = "chat-msg chat-msg-me";
      div.textContent = text;
      chatBody.appendChild(div);
      chatInput.value = "";
      chatBody.scrollTop = chatBody.scrollHeight;
    });
  
    chatBackBtn.addEventListener("click", () => {
      showPanelView("list");
      sidePanel.classList.remove("chat-mode");
    });
  
    // ==========================
    //  ポップアップ＆マーカー関連
    // ==========================
    // 前のポップアップを安全に閉じる
    function safeCloseActivePopup() {
      if (!activePopup) return;
      isProgrammaticClose = true;
      activePopup.remove();
      isProgrammaticClose = false;
      activePopup = null;
    }
  
    // ユーザーが✕した時だけマーカーも消す
    function bindPopupCloseToMarker(popup) {
      popup.on("close", () => {
        if (isProgrammaticClose) return; // コードから閉じたときは無視
        if (activeMarker) {
          activeMarker.remove();
          activeMarker = null;
        }
        activePopup = null;
      });
    }
  
    // ==========================
    //  地図ロード後の処理
    // ==========================
    map.on("load", async () => {
      // --- 日本ポリゴンの読み込み ---
      const res = await fetch("japan3.geojson");
      if (!res.ok) {
        alert("japan3.geojson が見つかりません（map.html と同じフォルダに置いてください）");
        return;
      }
      const geo = await res.json();
  
      const jpRings = extractJapanRings(geo);
      if (!jpRings.length) {
        alert("japan3.geojson にポリゴンが見つかりません");
        return;
      }
  
      // マスク表示
      const maskFC = buildInverseJapanMask(jpRings);
      map.addSource("jp-mask", { type: "geojson", data: maskFC });
      map.addLayer({
        id: "jp-mask",
        type: "fill",
        source: "jp-mask",
        paint: { "fill-color": "#BFD9F2", "fill-opacity": 1 },
      });
  
      // ラベルを日本の中だけに
      const japanGeom = { type: "MultiPolygon", coordinates: jpRings.map((r) => [asCW(r)]) };
      (map.getStyle().layers || [])
        .filter((l) => l.type === "symbol")
        .forEach((l) => {
          const base = l.filter || true;
          map.setFilter(l.id, ["all", base, ["within", japanGeom]]);
        });
  
      // ==========================
      //  クリックでピンを「移動」させる（常に1個）
      // ==========================
      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        const roundedLng = lng.toFixed(5);
        const roundedLat = lat.toFixed(5);
        const btnId = "createRoomBtn-" + Date.now();
  
        // 1) マーカーがあれば動かす、なければ作る
        if (activeMarker) {
          activeMarker.setLngLat([lng, lat]);
          // 前のポップアップは安全に消す
          safeCloseActivePopup();
        } else {
          const el = document.createElement("div");
          el.className = "marker";
          activeMarker = new maplibregl.Marker(el).setLngLat([lng, lat]).addTo(map);
        }
  
        // 2) 新しいポップアップを付ける
        activePopup = new maplibregl.Popup({
          offset: 18,
          closeButton: true,
          closeOnClick: false,
        })
          .setLngLat([lng, lat])
          .setHTML(`
            <div style="min-width:200px">
              <div style="font-weight:700; margin-bottom:6px;">この地点で</div>
              <a href="#" class="popup-create-btn" id="${btnId}">チャットルームを作成</a>
              <div class="muted" style="margin-top:6px">${roundedLng}, ${roundedLat}</div>
            </div>
          `)
          .addTo(map);
  
        // ユーザーが✕を押したらマーカーも消す
        bindPopupCloseToMarker(activePopup);
  
        // 3) ポップアップ内ボタンでモーダルを出す
        setTimeout(() => {
          const btn = document.getElementById(btnId);
          if (btn) {
            btn.addEventListener("click", (ev) => {
              ev.preventDefault();
              openRoomModal(lng, lat);
            });
          }
        }, 0);
      });
  
      // 視野を日本にフィット
      let minX = 180,
        minY = 90,
        maxX = -180,
        maxY = -90;
      jpRings.forEach((r) =>
        r.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        })
      );
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 20 }
      );
    });
  });
  