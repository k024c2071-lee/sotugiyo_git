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




// 서버 실행

// Cosmos DB 클라이언트 설정
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY; 
const secret=process.env.SECRET_KEY;
const client = new CosmosClient({ endpoint, key });
const usersdatabase = client.database("users");
const usersContainer = usersdatabase.container("users");


app.post('/register', async (req, res) => {
    const { email, password, username, location } = req.body;
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
      

      const redirectUrl = req.session.redirectTo || './pages/menu.html';
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
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
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




// app.post('/create-room', async (req, res) => {
//     // const userLocation = req.user.location; // 현재 로그인한 사용자 정보에서 위치 가져오기 (Passport.js 연동 필요)
//     // const currentUserId = req.user.id;

//     // // 1. 같은 지역 사용자 검색
//     // const querySpec = {
//     //     query: "SELECT * FROM c WHERE c.location = @location AND c.id != @currentUserId",
//     //     parameters: [
//     //         { name: "@location", value: userLocation },
//     //         { name: "@currentUserId", value: currentUserId }
//     //     ]
//     // };
//     // const { resources: usersInLocation } = await usersContainer.items.query(querySpec).fetchAll();

//     // // 2. 랜덤 사용자 선택 (예: 최대 3명)
//     // const shuffledUsers = usersInLocation.sort(() => 0.5 - Math.random());
//     // const invitedUsers = shuffledUsers.slice(0, 3);
//     // invitedUsers.push(req.user); // 채팅방 생성자도 추가

//     // 3. 채팅방 ID 생성
//     const roomId = `room_${new Date().getTime()}`;

//     // // 4. 이메일 초대 발송
//     // invitedUsers.forEach(user => {
//     //     if (user.id !== currentUserId) {
//     //         sendInvitationEmail(user.email, roomId);
//     //     }
//     // });

//     res.redirect(`/chat/${roomId}`); // 생성된 채팅방으로 이동
// });


const MAX_INVITEES = 10;

app.post('/create-room', async (req, res) => {
    // 1. 로그인 확인
    if (!req.session.user || !req.session.user.id || !req.session.user.email) {
        return res.status(401).redirect('/pages/login.html');
    }

    const creatorId = req.session.user.id;
    const creatorUsername = req.session.user.username;
    const creatorEmail = req.session.user.email;

    let creatorLocationGeoJson;

    try {
        // 2. 생성자 위치 정보 가져오기
        const { resource: creatorData } = await usersContainer.item(creatorId, creatorEmail).read();
        if (!creatorData || !creatorData.locationGeoJson) {
            console.warn(`ユーザ ${creatorUsername} の位置情報が登録されていません。`);
            return res.status(400).send("チャットルームを作成するには、まずプロフィールで位置情報（郵便番号）を登録してください。");
        }
        creatorLocationGeoJson = creatorData.locationGeoJson;

    } catch (dbError) {
        console.error("DB参照エラー", dbError);
        return res.status(500).send("サーバーエラーが発生しました。");
    }

    try {
        // 3. 주변 사용자 검색 (10km 반경)
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
        console.log(`[チャットルーム生成] ${creatorUsername} 周り ${radiusInMeters / 1000}km 内のユーザ ${allNearbyUsers.length}人発見`);

        // --- 4. 인원수 제한 및 랜덤 선택 로직 추가 ---
        let usersToInvite = allNearbyUsers; // 기본값: 찾은 모든 사용자

        if (allNearbyUsers.length > MAX_INVITEES) {
            console.log(`[人数制限] ${allNearbyUsers.length}の中 ${MAX_INVITEES}人だけ招待します。ランダムに選択中...`);
            // 배열을 랜덤하게 섞는 함수 (Fisher-Yates Shuffle 알고리즘)
            for (let i = usersToInvite.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [usersToInvite[i], usersToInvite[j]] = [usersToInvite[j], usersToInvite[i]]; // 요소 위치 교환
            }
            // 앞에서부터 MAX_INVITEES만큼만 잘라냄
            usersToInvite = usersToInvite.slice(0, MAX_INVITEES);
        }
        // ------------------------------------------

        // 5. 새 채팅방 ID 생성
        const roomId = `room_${new Date().getTime()}`;

        // 6. 선택된 사용자들에게 이메일 초대 발송
        if (usersToInvite.length > 0) {
            console.log(`メールを ${usersToInvite.length}に ${roomId}で (最大 ${MAX_INVITEES}人)`);
            await Promise.all(usersToInvite.map(user =>
                sendInvitationEmail(user.email, roomId, creatorUsername)
            ));
            console.log(`メール送信が完了しました。`);
        } else {
            console.log(`招待できるユーザーが見つかりませんでした。`);
        }

        // 7. 생성자를 새 채팅방으로 리디렉션
        res.redirect(`/chat/${roomId}`);

    } catch (error) {
        console.error("チャットルーム生成エラー", error);
        res.status(500).send("チャットルームの作成中にエラーが発生しました。");
    }
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

    socket.on('join room', (roomId) => {
      // const { roomId, sender} = data; // 클라이언트가 보낸 data 객체에서 roomId와 userInfo를 추출
      socket.join(roomId);
      // socket.username = sender; // userInfo 객체 안의 sender를 사용
      console.log(`${username} joined ${roomId} room`);
    });

    socket.on('chat message', async (data) => {
        const { roomId, message } = data;
        const sender = username;

        const chatMessage = {
            roomId,
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

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


// app.post('/invite-to-room', (req, res) => {
//     const { email, roomId } = req.body;
//     sendInvitationEmail(email, roomId);
//     res.status(200).send("招待メールを送信しました。");
// });