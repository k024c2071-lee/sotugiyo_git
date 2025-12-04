const express = require('express');
const bcrypt = require('bcrypt');
const { CosmosClient } = require('@azure/cosmos');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();


const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static('public'));
// app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const roomCache = {};

// 서버 실행

// Cosmos DB 클라이언트 설정
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY; 
const secret=process.env.SECRET_KEY;
const client = new CosmosClient({ endpoint, key });
const usersdatabase = client.database("users");
const usersContainer = usersdatabase.container("users");


app.post('/register', async (req, res) => {
    const { email, password, username, address1, address2 } = req.body;
    const postalCode = req.body.postalCode;

    if (!postalCode) {
        return res.status(400).send("郵便番号を入力してください。");
    }

    // 2. Nominatim 함수 호출
    let centroidCoords = null;
    try {
        // 일본 우편번호이므로 countryCode 'JP' 전달 (기본값이지만 명시)
        centroidCoords = await getCoordsFromPostalCodeOSM(postalCode, 'JP');
    } catch (coordError) {
        // API 호출 실패 시 (네트워크 오류 등), centroidCoords는 null이 됨
        // 이 경우, locationGeoJson도 null로 저장됨
    }

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        email,
        password: hashedPassword,
        username,
        location: { postalCode: postalCode },
        address1: address1,
        address2: address2,
        locationGeoJson: centroidCoords ? {
        type: "Point",
        coordinates: [centroidCoords.longitude, centroidCoords.latitude] // [경도, 위도]
    } : null
    };

    try {
        await usersContainer.items.create(newUser);
        res.redirect('./pages/login.html'); // 회원가입 성공 시 로그인 페이지로 이동
    } catch (error) {
        console.error("登録エラー：", error);
        res.status(500).send("失敗しました。");
    }
});





/**
 * Nominatim API를 사용해 우편번호로 좌표를 가져오는 함수
 * @param {string} postalCode - 검색할 우편번호 (예: "144-0052")
 * @param {string} countryCode - 국가 코드 (예: "JP" for Japan)
 * @returns {Promise<{latitude: number, longitude: number} | null>} 좌표 객체 또는 null
 */
async function getCoordsFromPostalCodeOSM(postalCode, countryCode = 'JP') {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postalCode)}&country=${countryCode}&format=jsonv2&limit=1`;
    
    console.log(`[Nominatim] 요청 URL: ${url}`); // 디버깅용 로그

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // Nominatim 사용 정책 준수를 위해 User-Agent 설정 (앱 이름/버전, 연락처 등)
                'User-Agent': 'MyChatApp/1.0 (k024c2071@g.neec.ac.jp)' // <- 본인 앱 정보로 수정!
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // 결과가 있고, 좌표 정보(lat, lon)가 있는지 확인
        if (data && data.length > 0 && data[0].lat && data[0].lon) {
            const latitude = parseFloat(data[0].lat);
            const longitude = parseFloat(data[0].lon);
            console.log(`[Nominatim] result: ${postalCode} -> lat=${latitude}, lon=${longitude}`);
            return { latitude, longitude };
        } else {
            console.warn(`[Nominatim] 郵便番号 ${postalCode}に対するの結果が見つかりません。`);
            return null; // 결과 없음
        }
    } catch (error) {
        console.error("[Nominatim] API エラー発生:", error);
        throw error; // 에러를 다시 던져서 상위에서 처리하도록 함
    }
}




// --- 세션 미들웨어 설정 ---
//　session設定
// 이 코드는 모든 라우트(app.post, app.get 등)보다 먼저 위치해야 합니다.


const sessionMiddleware = session({
  // 세션 ID 쿠키를 서명하는 데 사용되는 비밀 키입니다.
  // 실제 프로덕션 환경에서는 .env 파일에 저장하고 더 복잡한 문자열을 사용해야 합니다.
  // 秘密鍵
  secret, 
  
  // 세션 데이터가 변경되지 않았더라도 세션을 다시 저장할지 여부를 결정합니다.
  resave: false, 
  
  // 초기화되지 않은 (새롭지만 수정되지 않은) 세션을 저장할지 여부를 결정합니다.
  saveUninitialized: true, 
  
  cookie: { 
    secure: false, // 개발 중에는 http를 허용하기 위해 false로 설정합니다. 프로덕션에서는 true로 설정하세요.
    maxAge: 1000 * 60 * 60 // 쿠키 유효 기간 (예: 1시간)
  }
  // 참고: 기본 설정은 메모리 저장소입니다. 서버가 재시작되면 세션이 모두 사라집니다.
  // 프로덕션에서는 connect-mongo, connect-redis 등 데이터베이스 기반 세션 저장소를 사용하는 것이 좋습니다.
})
app.use(sessionMiddleware);

// --- 수정된 로그인 라우트 ---
app.post('/login', async (req, res) => {
  try {
    // 1. 사용자가 폼에 입력한 이메일과 비밀번호를 가져옵니다.
    const { email, password } = req.body;

    // 2. 데이터베이스에서 해당 이메일을 가진 사용자를 찾습니다.
    const querySpec = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [
        { name: "@email", value: email }
      ]
    };

    const { resources: users } = await usersContainer.items.query(querySpec).fetchAll();

    // 3. 사용자가 존재하지 않는 경우
    if (users.length === 0) {
      return res.status(404).send("会員を見つけません");
    }

    const user = users[0];

    // 4. 입력된 비밀번호와 데이터베이스의 암호화된 비밀번호를 비교합니다.
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (isPasswordMatch) {
      // 5. 비밀번호가 일치하는 경우 (로그인 성공)
      // 사용자 정보를 세션 객체에 저장합니다.
      // 이 정보는 사용자가 로그아웃하거나 세션이 만료될 때까지 서버에 유지됩니다.
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        location: user.location
      };
      

      const redirectUrl = req.session.redirectTo || './pages/map.html';
      delete req.session.redirectTo;

      // 세션 저장이 완료된 후 리디렉션합니다.
      req.session.save(() => {
        res.redirect(redirectUrl); // 로그인 후 이동할 페이지
      });
      
    } else {
      // 6. 비밀번호가 일치하지 않는 경우
      res.status(401).send("パスワードが間違っています");
    }

  } catch (error) {
    console.error("エラー発生", error);
    res.status(500).send("サーバーの問題でログインできません");
  }
});


//리다이렉트
app.get('/chat/:roomId', (req, res) => {
    // 1. 세션에 사용자 정보가 있는지 확인 (로그인 여부)
    if (!req.session.user) {
        // 2. 로그인이 안 되어 있다면:
        //    사용자가 원래 가려던 주소(예: '/chat/room_12345')를 세션에 저장합니다.
        req.session.redirectTo = req.originalUrl;
        
        // 3. 로그인 페이지로 강제 리디렉션합니다.
        res.redirect('/pages/login.html');
    } else {
        // 4. 로그인이 되어 있다면:
        //    채팅방 HTML 파일을 전송합니다. 
        //    (파일 경로는 본인 프로젝트에 맞게 수정하세요. 
        //     채팅 스크립트가 index.html에 있다면 index.html로 설정)
        res.sendFile(path.join(__dirname, 'public/pages', 'map.html'));
    }
});




// --- 로그아웃 라우트 ---
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('ログアウトに失敗しました。');
    }
    // 세션 삭제 후 로그인 페이지로 리디렉션
    res.redirect('/login.html');
  });
});


async function sendInvitationEmail(toEmail, roomId, senderName) { // 3. 발신자 이름을 받도록 수정
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER || 'YOUR_EMAIL@gmail.com', // 환경 변수 사용 권장
            pass: process.env.EMAIL_PASS || 'YOUR_EMAIL_PASSWORD' // !! 앱 비밀번호 사용 !!
        }
    });

    // 4. 발신자 이름을 메일에 포함
    const fromName = senderName || 'チャート友達'; // 발신자 이름 기본값

    let mailOptions = {
        from: `"${fromName} 様" <${process.env.EMAIL_USER || 'YOUR_EMAIL@gmail.com'}>`, // "발신자 이름" <이메일> 형식
        to: toEmail,
        subject: '新しいチャットルームへの招待',
        html: `<p>おはようございます!</p>
               <p>${fromName}様から新しいメールが届きました.</p>
               <p>下のリンクを押してください:</p>
               <a href="http://localhost:${PORT}/chat/${roomId}">チャート参加</a>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[success] to ${toEmail} (sender: ${senderName})`);
    } catch (error) {
        console.error(`[fail] to ${toEmail} :`, error);
    }
}





const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Cosmos DB chat 컨테이너 설정
const chartsdatabase = client.database("charts");
const chatsContainer = chartsdatabase.container("charts");

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.on('connection', (socket) => {
    const session = socket.request.session;
    const username = session.user.username;
    const userLocation = session.user.location; // 필요시 위치 정보도 사용 가능

    if (!session.user) {
        console.log('未認証のユーザーが接続を試みました。');
        socket.disconnect(true); // 강제 연결 종료
        return;
    }
    console.log(`${username} 様がつながりました.`);

    socket.on('join room', async (roomId) => {
      // const { roomId, sender} = data; // 클라이언트가 보낸 data 객체에서 roomId와 userInfo를 추출
      socket.join(roomId);
      // socket.username = sender; // userInfo 객체 안의 sender를 사용
      console.log(`${username} joined ${roomId} room`);
           // 1. 캐시 확인: 이미 룸 이름이 있으면 DB 쿼리 없이 종료
    if (roomCache[roomId]) {
        return;
    }


    // 2. 캐시에 없으면 DB에서 가져와 저장 (최초 1회 또는 서버 재시작 시 발생)
    try {
        const querySpec = {
            query: "SELECT c.name FROM c WHERE c.roomid = @roomId", 
            parameters: [{ name: "@roomId", value: roomId }]
        };
        const { resources: rooms } = await roomsContainer.items.query(querySpec).fetchAll();
        
        if (rooms && rooms.length > 0) {
            // **여기서 roomCache에 룸 이름을 저장합니다.**
            roomCache[roomId] = rooms[0].name; 
            console.log(`[캐시 저장] 룸 이름 '${rooms[0].name}'을(를) 캐시에 저장했습니다.`);
        } else {
            roomCache[roomId] = '알 수 없는 방'; // 방어 코드
        }
    } catch (error) {
        console.error("ルーム名前のキャッシング中のDBエラー:", error);
        roomCache[roomId] = 'DB 오류 발생 방';
    }

    // try {
    //     const querySpec = {
    //         query: "SELECT c.roomName FROM c WHERE c.sender = @username AND c.roomId = @roomId", 
    //         parameters: [{ name: "@username", value: username },{ name: "@roomId", value: roomId }]
    //     };
    //     const { resources: roomName } = await roomsContainer.items.query(querySpec).fetchAll();
        
    //     if (roomName.length > 0) {
    //         return;
    //     } else {
    //          const chatMessage = {
    //         roomId : roomId,
    //         roomName :  roomCache[roomId],
    //         sender : username,
    //         message : "チャットルームに参加しました！",
    //         timestamp: new Date()
    //         };

    //          await chatsContainer.items.create(chatMessage);
    //     }
    // } catch (error) {
    //     console.error("overlap check", error);
    // }      
    });

    socket.on('request history', async (roomId) => {
        if (!roomId) return;

        try {
            // 해당 방의 메시지만 쿼리 (예: 최근 50개)
            const querySpec = {
                query: "SELECT * FROM c WHERE c.roomId = @roomId ORDER BY c.timestamp DESC OFFSET 0 LIMIT 50",
                parameters: [{ name: "@roomId", value: roomId }]
            };
            const { resources: messages } = await chatsContainer.items.query(querySpec).fetchAll();
            
            // 쿼리 결과는 DESC (최신순)이므로, 클라이언트 표시를 위해 ASC (오래된순)으로 변경
            messages.reverse(); 

            // 요청한 사용자에게만(socket.emit) 내역 전송
            socket.emit('chat history', messages);
            console.log(`[履歴] ${username}に ${roomId}の履歴 ${messages.length}件を送信`);

        } catch (error) {
            console.error("チャット履歴の取得エラー:", error);
        }
    });



    socket.on('chat message', async (data) => {
        const { roomId, message } = data;
        const sender = username;
            // 1. **캐시에서 룸 이름을 가져옵니다. (DB 접근 없음!)**
        let roomName = roomCache[roomId];
    
    // 2. 캐시 미스 발생 시 (매우 드문 경우) DB 폴백 쿼리
    if (!roomName) {
        // 이 부분은 join room 로직에서 이미 처리되었어야 하지만, 안전을 위해 남겨둡니다.
        const querySpec = {
            query: "SELECT c.name FROM c WHERE c.roomid = @roomId",
            parameters: [{ name: "@roomId", value: roomId }]
        };
        try {
            const { resources: rooms } = await roomsContainer.items.query(querySpec).fetchAll();
            roomName = (rooms && rooms.length > 0) ? rooms[0].name : '알 수 없는 방';
            roomCache[roomId] = roomName; // 캐시 업데이트
        } catch (error) {
            console.error("채팅 메시지 전송 중 룸 이름 DB 조회 오류:", error);
            roomName = 'DB 오류 방';
        }
    } // if (!roomName)

        const chatMessage = {
            roomId,
            roomName : roomName,
            sender,
            message,
            timestamp: new Date()
        };

        // 1. 메시지를 Cosmos DB에 저장
        await chatsContainer.items.create(chatMessage);

        // 2. 같은 채팅방에 있는 모든 클라이언트에게 메시지 전송
        io.to(roomId).emit('chat message', chatMessage);
    });

    socket.on('invite user', async (data) => {
        // data 객체에는 { recipientEmail: '...', roomId: '...' }가 들어 있습니다.
        
        console.log(`[招待メール送信]
          sender: ${username}
          receiver: ${data.recipientEmail}
          chatroom: ${data.roomId}`);

        // 3. 이메일 발송 함수 호출 (발신자 이름 전달)
        await sendInvitationEmail(data.recipientEmail, data.roomId, username);
    });


    socket.on('disconnect', () => {
       console.log(`user disconnected`); 
    });
});

const roomsContainer = chartsdatabase.container("charts");


MAX_INVITEES = 10;
app.post('/api/create-room', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("ログインが必要です。");
    }

    const { name, description, isPublic, password, lng, lat } = req.body;
    const { username: creatorName, id: creatorId, email:creatorEmail } = req.session.user;

    if (!name || lng === undefined || lat === undefined) {
        return res.status(400).send("ルーム名と座標は必須です。");
    }

    // const newRoom = {
    //     // Cosmos DB는 id를 자동으로 생성하지 않으므로 직접 만듭니다.
    //     roomid: `room_${new Date().getTime()}`,
    //     name,
    //     description,
    //     isPublic,
    //     password: isPublic ? null : await bcrypt.hash(password, 10), // 비공개일 경우 암호화
    //     creatorId,
    //     creatorName,
    //     createdAt: new Date(),
    //     // GeoJSON 형식으로 좌표 저장 (지도 표기용)
    //     location: {
    //         type: "Point",
    //         coordinates: [parseFloat(lng), parseFloat(lat)] // [경도, 위도]
    //     }
    // };

    // const chatMessage = {
    //     roomId : newRoom.roomid,
    //     roomName : name,
    //     sender : creatorName,
    //     message : "チャットルームが作られました！",
    //     timestamp: new Date()
    // };




    try {
        let creatorLocationGeoJson = null;

        // 1. 作成者の位置情報取得とチェック
        const { resource: creatorData } = await usersContainer.item(creatorId, creatorEmail).read();
        if (!creatorData || !creatorData.locationGeoJson) {
            // 🚩 FIX: creatorUsername -> creatorName に修正
            console.warn(`ユーザ ${creatorName} の位置情報が登録されていません。`);
            return res.status(400).send("チャットルームを作成するには、まずプロフィールで位置情報（郵便番号）を登録してください。");
        }
        creatorLocationGeoJson = creatorData.locationGeoJson;
        
        // 2. 周辺ユーザーの検索 (100km 半径)
        const radiusInMeters = 100000;
        const querySpec = {
            query: "SELECT c.id, c.username, c.email FROM c WHERE ST_DISTANCE(c.locationGeoJson, @creatorLocation) <= @radius AND c.id != @creatorId",
            parameters: [
                { name: "@creatorLocation", value: creatorLocationGeoJson },
                { name: "@radius", value: radiusInMeters },
                { name: "@creatorId", value: creatorId }
            ]
        };

        const { resources: allNearbyUsers } = await usersContainer.items.query(querySpec).fetchAll();
        // 🚩 FIX: creatorUsername -> creatorName に修正
        console.log(`[チャットルーム生成] ${creatorName} 周り ${radiusInMeters / 1000}km 内のユーザ ${allNearbyUsers.length}人発見`);

        // 3. 人数制限およびランダム選択
        let usersToInvite = allNearbyUsers; 
        if (allNearbyUsers.length > MAX_INVITEES) {
            console.log(`[人数制限] ${allNearbyUsers.length}の中 ${MAX_INVITEES}人だけ招待します。ランダムに選択中...`);
            // 配列をランダムにシャッフル (Fisher-Yates Shuffle)
            for (let i = usersToInvite.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [usersToInvite[i], usersToInvite[j]] = [usersToInvite[j], usersToInvite[i]]; 
            }
            // MAX_INVITEES だけ切り出す
            usersToInvite = usersToInvite.slice(0, MAX_INVITEES);
        }


        const roomId = `room_${new Date().getTime()}`;
        const newRoom = {
            roomid: roomId,
            name,
            description,
            isPublic,
            // パスワードは非公開の場合のみハッシュ化
            password: isPublic ? null : await bcrypt.hash(password, 10), 
            creatorId,
            creatorName,
            createdAt: new Date(),
            // 💡 新しいフィールド: 招待ユーザーのIDと名前をリスト化して格納
            invitedUsers: usersToInvite.map(user => ({
                id: user.id,
                username: user.username
            })),
            location: {
                type: "Point",
                coordinates: [parseFloat(lng), parseFloat(lat)] // [経度, 緯度]
            }
        };

        // 4. DB にルーム文書を作成
        const { resource: createdRoom } = await roomsContainer.items.create(newRoom);
        console.log(`[ルーム作成] ${creatorName}が新しいルームを作成: ${name}`);
        
        // 5. DB に最初のメッセージを保存 (チャットルーム履歴用)
        const chatMessage = {
            roomId : newRoom.roomid,
            roomName : name,
            sender : creatorName,
            message : "チャットルームが作られました！",
            timestamp: new Date()
        };
        await chatsContainer.items.create(chatMessage);
        
        // 6. キャッシュにルーム名を追加
        roomCache[createdRoom.roomid] = createdRoom.name;

        // 7. 選択されたユーザーに招待メールを送信
        if (usersToInvite.length > 0) {
            console.log(`メールを ${usersToInvite.length}人に ${roomId}で (最大 ${MAX_INVITEES}人)`);
            await Promise.all(usersToInvite.map(user =>
                // 🚩 FIX: creatorUsername -> creatorName に修正
                sendInvitationEmail(user.email, roomId, creatorName)
            ));
            console.log(`メール送信が完了しました。`);
        } else {
            console.log(`招待できるユーザーが見つかりませんでした。`);
        }

        // 8. Socket.io で全クライアントにルームリスト更新を通知
        io.emit('rooms updated'); 
        
        // // 9. 🚩 CRITICAL FIX: 最後に一度だけリダイレクト応答を返して実行を終了
        // return res.redirect(`/chat/${roomId}`);
        res.status(201).json(createdRoom); // 생성된 룸 정보 반환
    } catch (error) {
        console.error("チャットルーム生成エラー (catch):", error);
        
        // 10. [CRITICAL FIX] ヘッダーが送信されていない場合のみエラー応答を返します
        if (!res.headersSent) {
            return res.status(500).send("チャットルームの作成中にサーバーエラーが発生しました。");
        }
        // ヘッダーが送信済みの場合はエラーをログに出力するだけ
        console.warn("ヘッダーはすでに送信されていますが、非同期エラーが発生しました。", error.code);
    }
});




app.get('/api/get-rooms', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("ログインが必要です。");
    }
    
    try {
        // 모든 룸 정보를 가져옵니다 (필요시 쿼리 최적화)
        const querySpec = {
            query: "SELECT * FROM c WHERE STARTSWITH(c.roomid, 'room_') ORDER BY c.createdAt DESC"
        };
        const { resources: rooms } = await roomsContainer.items.query(querySpec).fetchAll();
        res.status(200).json(rooms);
    } catch (error) {
        console.error("ルーム一覧の取得エラー:", error);
        res.status(500).send("ルーム情報の取得に失敗しました。");
    }
});

// --------------------------------------------------------------------------
// ルーム履歴
// --------------------------------------------------------------------------
app.get('/api/get-historyrooms', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("ログインが必要です。");
    }
    
    try {
        // 모든 룸 정보를 가져옵니다 (필요시 쿼리 최적화)
        const querySpec = {
                query: "SELECT DISTINCT c.roomId, c.roomName FROM c WHERE STARTSWITH(c.roomId, 'room_') AND c.sender = @username ORDER BY c.timestamp DESC OFFSET 0 LIMIT 50",
                parameters: [{ name: "@username", value: req.session.user.username }]
        };
        const { resources: rooms } = await roomsContainer.items.query(querySpec).fetchAll();
         console.log(`${req.session.user.username}session username---------------------------`);
        res.status(200).json(rooms);
    } catch (error) {
        console.error("ルーム履歴の取得エラー:", error);
        res.status(500).send("ルーム情報の取得に失敗しました。");
    }
});

// --------------------------------------------------------------------------
// 룸 검색 (신규 추가)
// --------------------------------------------------------------------------
app.get('/api/search-rooms', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("ログインが必要です。");
    }
    
    const keyword = req.query.q; // ?q=검색어
    if (!keyword) {
        return res.status(400).send("検索キーワードを入力してください。");
    }

    try {
        // 방(room_)이면서, 이름(name)에 키워드가 포함(CONTAINS)된 것 검색
        const querySpec = {
            query: "SELECT * FROM c WHERE STARTSWITH(c.roomid, 'room_') AND CONTAINS(c.name, @keyword)", 
            parameters: [
                { name: "@keyword", value: keyword }
            ]
        };

        const { resources: rooms } = await roomsContainer.items.query(querySpec).fetchAll();
        console.log(`検索キーワード: '${keyword}', 結果: ${rooms.length}건`);
        res.status(200).json(rooms); // 검색 결과 반환

    } catch (error) {
        console.error("ルーム検索エラー:", error);
        res.status(500).send("検索中にサーバーエラーが発生しました。");
    }
});


app.get('/mypage', (req, res) => {
    // 1. 세션에서 사용자 정보 확인
    if (!req.session.user) {
        // 로그인되어 있지 않다면 로그인 페이지로 리다이렉트
        return res.redirect('/login');
    }

    const userData = req.session.user;

    const mypageHtmlContent = generateMyPageHtml(userData);
    res.send(mypageHtmlContent);
});

// 新しいエンドポイント: クライアント側でユーザー情報を取得するための API
app.get('/api/user/profile', (req, res) => {
    if (!req.session.user) {
        // 認証されていない場合は 401 Unauthorized を返す
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 세션에서 필요한 사용자 정보만 추출하여 JSON으로 반환
    const userData = {
        username: req.session.user.username || 'ゲストユーザー',
        email: req.session.user.email || 'not-set@example.com',
        location: req.session.user.location || {}, // 拠点情報
    };

    res.json(userData);
});



app.post('/api/user/profile/update', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { username, email, location, address1, address2 } = req.body;
    const userId = req.session.user.id;
    // Partition Key로서의 이메일 (변경 전)
    const currentEmail = req.session.user.email; 

    if (!username || !email) {
        return res.status(400).json({ error: 'ユーザー名とメールアドレスは必須です。' });
    }

    try {
        // 1. 현재 사용자 문서 가져오기
        // 주의: 파티션 키가 이메일인 경우, 이메일을 변경하려면 문서를 삭제하고 새로 만들어야 합니다.
        // 여기서는 안전을 위해 이메일은 변경되지 않았거나, 변경 시 파티션 키 제약을 고려하지 않는 단순 업데이트로 가정합니다.
        // 만약 이메일이 파티션 키라면, 이메일 변경은 지원하지 않거나 복잡한 로직이 필요합니다.
        
        const { resource: userDoc } = await usersContainer.item(userId, currentEmail).read();

        if (!userDoc) {
            return res.status(404).json({ error: 'ユーザーが見つかりません。' });
        }


        // 2. 문서 업데이트
        userDoc.username = username;
        userDoc.email = email; // 이메일이 파티션 키가 아니거나 변경되지 않았다고 가정
        userDoc.location = location;
        userDoc.address1 = address1;
        userDoc.address2 = address2;

        // 3. DB 저장 (Replace)
        // Partition Key가 변경되지 않았다는 전제하에 replace
        await usersContainer.item(userId, currentEmail).replace(userDoc);

        // 4. 세션 정보 업데이트
        req.session.user.username = username;
        req.session.user.email = email;
        req.session.user.location = location;


        // 세션 저장 (비동기)
        req.session.save((err) => {
            if (err) {
                console.error("セッション保存エラー:", err);
                return res.status(500).json({ error: 'セッションの更新に失敗しました。' });
            }
            res.json({ message: 'プロフィールを更新しました。', user: req.session.user });
        });

    } catch (error) {
        console.error("プロフィール更新エラー:", error);
        res.status(500).json({ error: 'プロフィールの更新中にエラーが発生しました。' });
    }
});


function generateMyPageHtml(userData) {
    // ユーザー名からアバターのイニシャルを取得
    const initial = userData.username ? userData.username.charAt(0).toUpperCase() : 'U';

    return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>CHATRA｜マイページ</title>
  <link rel="stylesheet" href="/assets/css/pages/mypage.css">
  <link rel="stylesheet" href="/assets/css/pages/signup.css">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>

  <!-- ヘッダー -->
  <header class="topbar">
    <div class="logo">CHATRA</div>
    <div class="top-actions">
      <span class="username" id="username">ようこそ、Userさん</span>
      <button class="outline-btn">ログアウト</button>
    </div>
  </header>

  <div class="mypage-layout">

    <!-- 左側：プロフィール -->
    <aside class="profile-panel">

      <div class="profile-card">
        <div class="avatar">
          <span id="display-avatar-initial">U</span>
        </div>
        <h2 class="profile-name" id="display-name">User Name</h2>
        <p class="profile-mail" id="display-email">user@example.com</p>

        <button class="primary-btn w-100" id="open-profile-edit">
          プロフィール編集
        </button>
      </div>

      <div class="small-card">
        <h3 class="small-title">基本情報</h3>
        <p>
            郵便番号：<span id="display-postal"></span>
        </p>
      </div>

    </aside>

    <!-- 右側：メイン -->
    <main class="main-panel">

      <section class="section-block">
        <div class="section-head">
          <h2>今参加しているチャットルーム</h2>
          <a href="#" class="link-sm">すべて見る</a>
        </div>

        <div class="card-grid">
          <article class="room-card">
            <h3>伊香保温泉トーク</h3>
            <p class="room-meta">参加者 12人 ・ 最終更新 2025/11/10</p>
            <p class="room-desc">伊香保のおすすめスポット共有ルーム。</p>
          </article>

          <article class="room-card">
            <h3>埼玉観光まとめ</h3>
            <p class="room-meta">参加者 8人 ・ 最終更新 2025/11/08</p>
            <p class="room-desc">川越・秩父・長瀞の話題中心。</p>
          </article>

          <article class="room-card">
            <h3>関東日帰りスポット</h3>
            <p class="room-meta">参加者 21人 ・ 最終更新 2025/11/07</p>
            <p class="room-desc">週末のお出かけ候補を雑談。</p>
          </article>
        </div>
      </section>

      <section class="section-block">
        <div class="section-head">
          <h2>最近チャットしたチャットルーム</h2>
          <a href="#" class="link-sm">履歴をすべて見る</a>
        </div>

        <div class="list-block">
          <div class="list-item">
            <div>
              <h3>北海道グルメ旅</h3>
              <p class="room-meta">直近の発言：2分前</p>
            </div>
            <button class="outline-btn sm">開く</button>
          </div>

          <div class="list-item">
            <div>
              <h3>京都・奈良 寺社好き</h3>
              <p class="room-meta">直近の発言：1時間前</p>
            </div>
            <button class="outline-btn sm">開く</button>
          </div>

          <div class="list-item">
            <div>
              <h3>温泉天国・箱根</h3>
              <p class="room-meta">直近の発言：昨日</p>
            </div>
            <button class="outline-btn sm">開く</button>
          </div>

          <div class="list-item">
            <div>
              <h3>東北ドライブ計画</h3>
              <p class="room-meta">直近の発言：3日前</p>
            </div>
            <button class="outline-btn sm">開く</button>
          </div>

        </div>
      </section>

    </main>

  </div>

  <!-- ▼ プロフィール編集モーダル ▼ -->
  <div class="profile-edit-overlay is-hidden" id="profile-edit-modal">

    <div class="profile-edit-dialog">

      <header class="profile-edit-header">
        <h2>プロフィール編集</h2>
        <button class="icon-btn" id="close-profile-edit">×</button>
      </header>

      <div class="profile-edit-body">

        <!-- アイコン -->
        <div class="profile-edit-avatar">
          <div class="avatar large">
            <span id="edit-avatar-initial">U</span>
          </div>
        </div>

        <!-- 入力フォーム -->
        <form class="profile-edit-form" id="profile-edit-form">

          <div class="form-row">
            <label for="edit-name">ユーザー名</label>
            <input id="edit-name" type="text">
          </div>

          <div class="form-row">
            <label for="edit-email">メールアドレス</label>
            <input id="edit-email" type="email">
          </div>

            <fieldset class="address-group">
              <legend>あなたの住所</legend>

              <div class="form-row">
                <label class="field postal-code-field">
                    <span>郵便番号</span>
                    <input type="text" id="postal-code" name="postalCode" placeholder="例：144-0052" required />
                    <div class="input-with-button">
                    <button type="button" onclick="searchPostalCode()">検索</button>
                    </div>
                </label>
              </div>

              <div class="form-row">
                <label class="field">
                    <span>都道府県・市区町村</span>
                    <input type="text" id="address1" name="address1" placeholder="例：東京都大田区" required />
                </label>
              </div>

              <div class="form-row">
                <label class="field">
                    <span>番地・建物名・部屋番号</span>
                    <input type="text" id="address2" name="address2" placeholder="例：西蒲田５丁目２３−２２ マンション名 101号室" />
                </label>
              </div>
            </fieldset>


          <div class="profile-edit-footer">
            <button class="outline-btn" type="button" id="cancel-profile-edit">キャンセル</button>
            <button class="primary-btn" type="submit">保存する</button>
          </div>

        </form>

      </div>

    </div>

  </div>

  <!-- JS -->
  <script src="/assets/js/mypage.js"></script>


  
    <script>


  async function searchPostalCode() {
  const postalCodeInput = document.getElementById('postal-code');
  const address1Input = document.getElementById('address1');
  const postalCode = postalCodeInput.value;

  if (!postalCode) {
    alert("郵便番号を入力してください。");
    return;
  }

  // zipcloud API URL 생성 (하이픈(-) 제거 필요)
   const apiUrl = "https://zipcloud.ibsnet.co.jp/api/search?zipcode=" + postalCode.replace(/-/g, '');

  try {
    // fetch API를 사용해 zipcloud 서버에 GET 요청
    const response = await fetch(apiUrl);
    const data = await response.json(); // 응답을 JSON 형태로 파싱

    // API 응답 상태 확인
    if (data.status === 200 && data.results) {
      // 성공적으로 주소를 찾았을 경우
      const result = data.results[0];
      // 주소 조합 (都道府県 + 市区町村 + 町域名)
      const fullAddress = result.address1 + result.address2 + result.address3;
      address1Input.value = fullAddress; // address1 필드에 자동 입력
    } else if (data.status === 400 || data.status === 500) {
      // 우편번호 형식이 잘못되었거나, 해당 주소가 없을 경우
       alert("住所が見つかりませんでした: " + data.message);
      address1Input.value = ''; // 필드 비우기
    } else {
      alert("予期せぬエラーが発生しました。");
      address1Input.value = '';
    }
  } catch (error) {
    console.error("郵便番号APIの呼び出し中にエラーが発生しました:", error);
    alert("住所の検索中にネットワークエラーが発生しました。");
    address1Input.value = '';
  }
}


    </script>
  

</body>
</html>
    `;
}


server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


// app.post('/invite-to-room', (req, res) => {
//     const { email, roomId } = req.body;
//     sendInvitationEmail(email, roomId);
//     res.status(200).send("招待メールを送信しました。");
// });