document.addEventListener("DOMContentLoaded", () => {

    const modal = document.getElementById("profile-edit-modal");
    const openBtn = document.getElementById("open-profile-edit");
    const closeBtn = document.getElementById("close-profile-edit");
    const cancelBtn = document.getElementById("cancel-profile-edit");
    const form = document.getElementById("profile-edit-form");
    const mypageButton = document.getElementById('mypageButton');

    /* --------------------
        データ取得と表示
    -------------------- */

    /**
     * サーバーからユーザーデータを取得し、画面に反映する
     */
    async function fetchUserData() {
        try {
            // サーバーの新しい API エンドポイントからデータを取得
            const response = await fetch('/api/user/profile');

            if (!response.ok) {
                // 認証失敗やサーバーエラーの場合
                throw new Error('Failed to fetch user data: ' + response.statusText);
            }

            const userData = await response.json();
            updateDisplay(userData);

        } catch (error) {
            console.error("ユーザー情報の取得中にエラーが発生しました:", error);
            // 에러 표시 처리 (예: 에러 메시지를 DOM에 표시)
        }
    }

    /**
     * 取得したユーザーデータを画面上の要素に反映する
     * @param {object} userData - ユーザー情報オブジェクト
     */
    function updateDisplay(userData) {
        const { username, email, location } = userData;

        // ヘッダーのユーザー名
        document.getElementById("username").textContent = `ようこそ、${username}さん`;
        
        // プロフィールカードの表示
        document.getElementById("display-name").textContent = username;
        document.getElementById("display-email").textContent = email;
        
        // 基本情報
        document.getElementById("display-postal").textContent = location.postalCode;
        
        
        // アバターのイニシャル
        const initial = username.charAt(0).toUpperCase() || "U";
        document.getElementById("display-avatar-initial").textContent = initial;
        document.getElementById("edit-avatar-initial").textContent = initial;

    }

    // ページ読み込み時にデータ取得を開始
    fetchUserData();


    /* --------------------
        画面遷移 (既存コード)
    -------------------- */
    if (mypageButton) {
        // クリック イベント リスナーを追加
        mypageButton.addEventListener('click', () => {
            // MyPage 経路に移動
            window.location.href = '/mypage';
        });
    }


    /* --------------------
        モーダル開閉
    -------------------- */
    function openModal() {
        modal.classList.remove("is-hidden");

        // 💡 폼에 현재의 표시 내용과 실제 값을 반영 (fetchUserData/updateDisplay 後のデータを使用)
        document.getElementById("edit-name").value =
            document.getElementById("display-name").textContent;

        document.getElementById("edit-email").value =
            document.getElementById("display-email").textContent;

        // 拠点と興味は「拠点：」や「興味：」を除去して value 에 설정
        document.getElementById("postal-code").value =
            document.getElementById("display-postal").textContent;


        // Select box の現在の値に合わせて selected を設定
        const currentBase = document.getElementById("edit-base").value;
        document.getElementById("edit-base").value = currentBase; 
        
        const currentTheme = document.getElementById("edit-theme").value;
        document.getElementById("edit-theme").value = currentTheme;
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
        const postalCode = document.getElementById("postal-code").value.trim();
        const address1 = document.getElementById("address1").value.trim();
        const address2 = document.getElementById("address2").value.trim();

        // 1. 画面表示の更新 (クライアント側)
        const updatedUserData = {
            username: name,
            email: email,
            location: { postalCode: postalCode },
            address1: address1,
            address2: address2
        };
        saveProfile(updatedUserData);

        // 2. サーバーへのデータ送信 (未実装이지만, 여기에서 API 호출을 통해 서버에 저장)
        // saveProfile(updatedUserData); 

        closeModal();
    });



    async function saveProfile(data) {
        try {
            const response = await fetch('/api/user/profile/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                alert(result.message); // "プロフィールを更新しました。"
                
                // 성공 시 서버가 보내준 최신 유저 정보로 화면 갱신
                if (result.user) {
                    updateDisplay(result.user);
                }
                closeModal(); // 모달 닫기
            } else {
                // 실패 시 에러 메시지 표시
                alert(`更新失敗: ${result.error}`);
            }

        } catch (error) {
            console.error("저장 중 오류 발생:", error);
            alert("通信エラーが発生しました。");
        }
    }



    /* --------------------
        テーマ切替
    -------------------- */
    function applyTheme(theme) {
        const themeName = theme === "ダーク" ? "dark" : "light";
        
        if (themeName === "dark") {
            document.body.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            document.body.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
    }

    // ページ読み込み時：localStorage 의 테마 설정을 fetchUserData 안으로 통합하여 데이터와 함께 처리했습니다.
});