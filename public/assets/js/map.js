// /public/assets/js/pages/map.js
document.addEventListener("DOMContentLoaded", () => {

    // console.log("A. DOMContentLoaded 이벤트 발생. 스크립트 시작."); // <-- 로그 A

    const socket = io();
    // ==========================
    //  基本設定
    // ==========================
    const STYLE_URL = "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json";
    const JP_BOUNDS = [[121.5, 19.5], [153.5, 47.5]];


    try {
        map = new maplibregl.Map({
            container: "map",
            style: STYLE_URL,
            center: [138.25, 36.2],
            zoom: 5,
            maxZoom: 22,
            maxBounds: JP_BOUNDS,
            dragRotate: false,
            pitchWithRotate: false,
        });
        
        console.log("C. map 객체 생성자(new) 실행 완료."); // <-- 로그 C
    } catch (err) {
        console.error("💥 맵 객체 생성(new) 중 즉시 에러 발생:", err); // <-- 에러 로그
        return; // 맵 생성이 안되면 이후 코드 실행 불가
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
  

    // map.on("click", (e) => {
    //     alert("지도 클릭 성공! 좌표: " + e.lngLat.lng);
    // });
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
    const viewList2 = document.getElementById("view-list2");
    const viewChat = document.getElementById("view-chat");

    const searchInput = document.getElementById("searchInput");
    const searchBtn = document.getElementById("searchBtn");
    const searchResultList = document.getElementById("searchResultList"); 
  
    const roomListEl = document.getElementById("roomList");
    const roomListE2 = document.getElementById("roomList2");
    const chatRoomName = document.getElementById("chatRoomName");
    const chatBody = document.getElementById("chatBody");
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatBackBtn = document.getElementById("chatBackBtn");

    let currentRoomId = null;
  
    const modal = document.getElementById("roomModal");
    const backdrop = document.getElementById("modalBackdrop");
    const closeModalBtn = document.getElementById("closeModal");
    const cancelBtn = document.getElementById("cancelBtn");
    const roomForm = document.getElementById("roomForm");
    const submitBtn = document.getElementById("submitBtn");
    const roomPublic = document.getElementById("roomPublic");
    const pwRow = document.getElementById("pwRow");
    const roomPassword = document.getElementById("roomPassword");
    const roomLng = document.getElementById("roomLng");
    const roomLat = document.getElementById("roomLat");
    const roomRadiusInput = document.getElementById("roomRadius"); // [추가] 슬라이더
    const radiusValueSpan = document.getElementById("radiusValue"); // [추가] 숫자 표시

    //パスワード設定
    const passwordModal = document.getElementById("passwordModal");
    const passwordForm = document.getElementById("passwordForm");
    const inputRoomPassword = document.getElementById("inputRoomPassword");
    const targetRoomIdInput = document.getElementById("targetRoomId");
    const closePasswordModalBtn = document.getElementById("closePasswordModal");

    
  
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



    function updateSliderUI() {
        const val = roomRadiusInput.value;
        const min = roomRadiusInput.min;
        const max = roomRadiusInput.max;
        
        // 텍스트 업데이트
        radiusValueSpan.textContent = val;

        // 배경 그라데이션 업데이트 (파란색 채우기)
        const percentage = ((val - min) / (max - min)) * 100;
        roomRadiusInput.style.background = `linear-gradient(to right, #007bff 0%, #007bff ${percentage}%, #e0e0e0 ${percentage}%, #e0e0e0 100%)`;
    }

    // 슬라이더 이벤트 리스너 등록
    if (roomRadiusInput) {
        roomRadiusInput.addEventListener('input', updateSliderUI);
        updateSliderUI(); // 초기화 시 한 번 실행
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

        // ==========================
    //  모달 제어 수정 (초기화 로직 추가)
    // ==========================
    function closeRoomModal() {
        modal.classList.remove("active");
        backdrop.classList.remove("active");
        roomForm.reset();
        pwRow.style.display = "none";
        roomPassword.value = "";
        
        // [추가] 슬라이더 초기값(10km)으로 리셋
        if(roomRadiusInput) {
            roomRadiusInput.value = 10; 
            updateSliderUI();
        }
    }
  
    roomPublic.addEventListener("change", () => {
      const isPublic = roomPublic.checked;
      pwRow.style.display = isPublic ? "none" : "grid";
      if (isPublic) roomPassword.value = "";
    });
  
    roomForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      submitBtn.disabled = true;
      submitBtn.textContent = '作成中...お待ちください';
  
      const payload = {
        name: document.getElementById("roomName").value.trim(),
        description: document.getElementById("roomDesc").value.trim(),
        isPublic: roomPublic.checked,
        password: roomPublic.checked ? "" : roomPassword.value,
        lng: parseFloat(roomLng.value),
        lat: parseFloat(roomLat.value),
        distance: parseInt(roomRadiusInput.value, 10)
      };
  
      if (!payload.name) {
        alert("ルーム名を入力してください。");
        return;
      }
      if (!payload.isPublic && !payload.password) {
        alert("非公開の場合、パスワードを入力してください。");
        return;
      }
  

      try {
          const response = await fetch('/api/create-room', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
          });

          if (response.ok) {
              alert("ルームが作成されました！");
              // 2. (중요) 서버가 생성된 룸 정보를 JSON으로 응답
              const newRoom = await response.json();

              // const chatSystemId = newRoom.id
            
              // // 3. (중요) 응답받은 JSON에서 roomid를 추출
              const newRoomId = newRoom.roomid;
              closeRoomModal();
              if (!newRoomId) {
                alert("룸 생성은 성공했으나, id를 받지 못했습니다.");
                closeRoomModal();
                return;
              }
              alert("ルームが作成されました！チャットルームに移動します。");
              window.location.href = `/chat/${newRoomId}`;
              // 핀 추가 로직은 'rooms updated' 이벤트를 통해 처리되므로 여기서 따로 안 함
          } else {
              const errorText = await response.text();
              alert(`ルーム作成失敗: ${errorText}`);
              submitBtn.disabled = false;
              submitBtn.textContent = originalButtonText;
          }
      } catch (error) {
          console.error("ルーム作成APIエラー:", error);
          alert("ルーム作成中にネットワークエラーが発生しました。");
          submitBtn.disabled = false;
          submitBtn.textContent = originalButtonText;
      } finally {
        // 3. 処理が完了したら、ボタンを有効に戻す
        submitBtn.disabled = false;
        submitBtn.textContent = originalButtonText;
    }

    });

      // console.log("✅ ルーム作成データ", payload);
      // alert("サンプル：ルーム作成データをコンソールに出力しました。");
      // closeRoomModal();
  
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
      viewList2.style.display = "none";
      viewChat.style.display = "none";
  
      if (name === "search") viewSearch.style.display = "block";
      if (name === "list") viewList.style.display = "block";
      if (name === "list2") viewList2.style.display = "block"
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
  


    // --- 🚀 [핵심] 룸 입장 처리 함수 (공개/비공개 분기) ---
    function handleRoomEntry(room) {
        // 1. 공개 방이면 바로 입장
        if (room.isPublic) {
            window.location.href = `/chat/${room.roomid}`;
        } else {
            // 2. 비공개 방이면 패스워드 모달 띄우기
            targetRoomIdInput.value = room.roomid;
            inputRoomPassword.value = "";
            passwordModal.classList.add("active");
            backdrop.classList.add("active"); // 배경 어둡게
        }
    }

    // --- 🚀 [핵심] 패스워드 모달 처리 ---
    function closePasswordModal() {
        passwordModal.classList.remove("active");
        backdrop.classList.remove("active"); // 배경 원복 (단, 룸생성 모달과 겹칠 경우 주의)
        // 만약 룸 생성 모달이 열려있지 않다면 backdrop 제거
        if (!modal.classList.contains("active")) {
            backdrop.classList.remove("active");
        }
    }

    if (closePasswordModalBtn) {
        closePasswordModalBtn.addEventListener("click", closePasswordModal);
    }

    if (passwordForm) {
        passwordForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const roomId = targetRoomIdInput.value;
            const password = inputRoomPassword.value;

            try {
                const response = await fetch('/api/verify-room-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId, password })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // 패스워드 일치 -> 입장
                    window.location.href = `/chat/${roomId}`;
                } else {
                    alert(result.error || "パスワードが間違っています。");
                }
            } catch (error) {
                console.error(error);
                alert("エラーが発生しました。");
            }
        });
    }

  
    function renderRoomList(rooms) {
      roomListEl.innerHTML = "";
      if (!rooms || rooms.length === 0) {
          roomListEl.innerHTML = '<li class="muted">まだルームがありません。</li>';
          return;
      }
      rooms.forEach((room) => {
        const li = document.createElement("li");
        li.className = "room-item";
        li.innerHTML = `
          <div class="room-item-title">${room.name}</div>
          <div class="room-item-desc">${room.description || ""}</div>
        `;
        li.addEventListener("click", () => handleRoomEntry(room));
        roomListEl.appendChild(li);
      });
    }


    async function fetchAndRenderRooms() {
        try {
            const response = await fetch('/api/get-rooms');
            if (!response.ok) {
                if(response.status === 401) {
                    alert("セッションが切れました。ログインしてください。");
                    window.location.href = '/pages/login.html'; // ログインページへ
                }
                throw new Error("ルームリストの取得に失敗");
            }
            const rooms = await response.json();
            renderRoomList(rooms);
            
            // ✅ (추가) 지도에 핀을 그리는 로직
            // 기존 핀들 제거 (아직 핀 저장 로직이 없으므로 생략)
            // rooms.forEach(room => addPinToMap(room));

            // -----------------------------------------------------
            const path = window.location.pathname;
        // 정규식: /chat/ 뒤에 /가 아닌 문자가 1개 이상 있는지 확인
            const chatUrlMatch = path.match(/^\/chat\/([^/]+)/); 

        if (chatUrlMatch) {
            const roomIdFromUrl = chatUrlMatch[1]; // URL에서 roomid 추출
            
            // 방금 불러온 rooms 목록에서 해당 ID를 찾습니다.
            const roomToOpen = rooms.find(r => r.roomid === roomIdFromUrl); 

            if (roomToOpen) {
                // ----------------------------------------------------
                // ✅ 찾았다면, 리스트의 'click' 이벤트와 동일한 작업을 수행
                // ----------------------------------------------------
                currentRoomId = roomToOpen.roomid; // 현재 룸 ID 설정
                chatRoomName.textContent = roomToOpen.name;
                chatBody.innerHTML = `<div class="chat-msg chat-msg-other">${roomToOpen.name} へようこそ！</div>`;
                
                openSidePanel(); // 사이드 패널 열기
                showPanelView("chat"); // 채팅 뷰 보여주기
                sidePanel.classList.add("chat-mode"); // 채팅 모드 활성화

                // 소켓 연결 및 히스토리 요청
                socket.emit('join room', currentRoomId);
                socket.emit('request history', currentRoomId);
            } else {
                // URL은 /chat/...인데 목록에 없는 방일 경우
                console.warn("URLのルームIDが見つかりません:", roomIdFromUrl);
            }
        }
        // ----------------------------------------------------

        } catch (error) {
            console.error("ルームリストの取得エラー:", error);
            roomListEl.innerHTML = '<li class="muted">ルームの読み込みに失敗しました。</li>';
        }
    }
  
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text || !currentRoomId) return;
      // const div = document.createElement("div");
      // div.className = "chat-msg chat-msg-me";
      // div.textContent = text;
      // chatBody.appendChild(div);
      chatInput.value = "";
      // chatBody.scrollTop = chatBody.scrollHeight;
    });
  
    chatBackBtn.addEventListener("click", () => {
      showPanelView("list");
      sidePanel.classList.remove("chat-mode");
      currentRoomId = null;
    });



      socket.on('chat message', (msg) => {
          // 내가 지금 보고 있는 방의 메시지일 때만 화면에 그립니다.
          
              const div = document.createElement("div");
              
              // (간단한 예시: msg.sender와 내 세션 username 비교 필요)
              // 여기서는 간단하게 'other'로 처리 (추후 내 세션 username과 비교 로직 필요)
              div.className = "chat-msg chat-msg-other"; // 
              div.textContent = `${msg.sender}: ${msg.message}`;
              
              chatBody.appendChild(div);
              chatBody.scrollTop = chatBody.scrollHeight;
  
        })


      socket.on('chat history', (messages) => {
        chatBody.innerHTML = ''; // 기존 내역 초기화
        messages.forEach(msg => {
            const div = document.createElement("div");
            div.className = "chat-msg chat-msg-other"; // (내 메시지인지 비교 필요)
            div.textContent = `${msg.sender}: ${msg.message}`;
            chatBody.appendChild(div);
        });
        chatBody.scrollTop = chatBody.scrollHeight; // 스크롤 맨 아래로
    });



    // ✅ 新規追加: サーバーからルーム更新通知を受信
    socket.on('rooms updated', () => {
        console.log("ルームリストが更新されました。再読み込みします...");
        fetchAndRenderRooms(); // 룸 목록과 핀을 다시 불러옵니다.
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
    //  룸 검색 기능 (✅ 신규 추가)
    // ==========================
    if (searchBtn) {
        searchBtn.addEventListener("click", async () => {
            const keyword = searchInput.value.trim();
            if (!keyword) {
                alert("検索キーワードを入力してください。");
                return;
            }
            
            searchResultList.innerHTML = '<li class="muted">検索中...</li>';
            
            try {
                // 검색 API 호출
                const response = await fetch(`/api/search-rooms?q=${encodeURIComponent(keyword)}`);
                if (!response.ok) {
                    throw new Error("검색 실패");
                }
                const rooms = await response.json();
                renderSearchResults(rooms); // 검색 결과 렌더링 함수 호출
            } catch (err) {
                console.error(err);
                searchResultList.innerHTML = '<li class="muted">検索エラーが発生しました。</li>';
            }
        });
    }

    // 검색 결과 렌더링 (searchResultList)
    function renderSearchResults(rooms) {
        searchResultList.innerHTML = "";
        if (!rooms || rooms.length === 0) {
            searchResultList.innerHTML = '<li class="muted">該当するルームが見つかりません。</li>';
            return;
        }
        
        rooms.forEach(room => {
            const li = document.createElement("li");
            li.className = "room-item";
            li.innerHTML = `
                <div class="room-item-title">${room.name}</div>
                <div class="room-item-desc">${room.description || ""}</div>
            `;
            li.addEventListener("click", () => handleRoomEntry(room));
            searchResultList.appendChild(li);
        });
    }
  



    //ルーム履歴
    async function renderHistoryResults() {
        try {
                // 검색 API 호출
              const response = await fetch(`/api/get-historyrooms`);
              if (!response.ok) {
                  throw new Error("fail to fetch" );
              }
              const rooms = await response.json();
              rooms.forEach(room => {
              const li = document.createElement("li");
              li.className = "room-item";
              li.innerHTML = `
                  <div class="room-item-title">${room.roomName}</div>
                  <div class="room-item-desc">${room.desc || ""}</div>
              `;
              li.addEventListener("click", () => {
                // 클릭 시 페이지 이동 (리다이렉트)
              window.location.href = `/chat/${room.roomId}`;
            });

            // li.addEventListener("click", () => {
            //     if (room.isPublic !== undefined) {
            //         handleRoomEntry(room);
            //     } else {
            //         // 정보가 부족하면 그냥 이동 (서버 채팅 페이지에서 튕겨내거나 해야 함)
            //          window.location.href = `/chat/${room.roomId || room.roomid}`;
            //     }
            //     });

            roomListE2.appendChild(li);
            })

            } catch (err) {
                console.error(err);
                roomListE2.innerHTML = '<li class="muted">検索エラーが発生しました。</li>';
            }
        // if (!rooms || rooms.length === 0) {
        //     searchResultList.innerHTML = '<li class="muted">該当するルームが見つかりません。</li>';
        //     return;
        // }
    }

    renderHistoryResults();
    fetchAndRenderRooms();

    // ==========================
    //  地図ロード後の処理
    // ==========================
    map.on("load", async () => {
      // --- 日本ポリゴンの読み込み ---

      console.log("1. 'load' 이벤트 시작됨.")

      const res = await fetch("/japan3.geojson");
      if (!res.ok) {
        alert("japan3.geojson が見つかりません（map.html と同じフォルダに置いてください）");
        return;
      }
      const geo = await res.json();

      console.log("2. 'load' 성공.")
  
      const jpRings = extractJapanRings(geo);
      if (!jpRings.length) {
        alert("japan3.geojson にポリゴンが見つかりません");
        return;
      }

      console.log("3. 폴리건로드.")
  
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
  

        console.log("4 로드중.")
      // ==========================
      //  クリックでピンを「移動」させる（常に1個）
      // ==========================
      map.on("click", (e) => {

        console.log("성공!!!!!!!!!!!!!!")
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
