const express = require('express');
const bcrypt = require('bcrypt');
const { CosmosClient } = require('@azure/cosmos');
require('dotenv').config();



const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static('public'));
// app.use(express.urlencoded({ extended: true }));



// 서버 실행

// Cosmos DB 클라이언트 설정
const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY; 
const client = new CosmosClient({ endpoint, key });
const usersdatabase = client.database("users");
const usersContainer = usersdatabase.container("users");

app.post('/register', async (req, res) => {
    const { email, password, username, location } = req.body;

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        email,
        password: hashedPassword,
        username,
        location
    };

    try {
        await usersContainer.items.create(newUser);
        res.redirect('/login'); // 회원가입 성공 시 로그인 페이지로 이동
    } catch (error) {
        console.error("登録エラー：", error);
        res.status(500).send("失敗しました。");
    }
});







app.post('/create-room', async (req, res) => {
    const userLocation = req.user.location; // 현재 로그인한 사용자 정보에서 위치 가져오기 (Passport.js 연동 필요)
    const currentUserId = req.user.id;

    // 1. 같은 지역 사용자 검색
    const querySpec = {
        query: "SELECT * FROM c WHERE c.location = @location AND c.id != @currentUserId",
        parameters: [
            { name: "@location", value: userLocation },
            { name: "@currentUserId", value: currentUserId }
        ]
    };
    const { resources: usersInLocation } = await usersContainer.items.query(querySpec).fetchAll();

    // 2. 랜덤 사용자 선택 (예: 최대 3명)
    const shuffledUsers = usersInLocation.sort(() => 0.5 - Math.random());
    const invitedUsers = shuffledUsers.slice(0, 3);
    invitedUsers.push(req.user); // 채팅방 생성자도 추가

    // 3. 채팅방 ID 생성
    const roomId = `room_${new Date().getTime()}`;

    // 4. 이메일 초대 발송
    invitedUsers.forEach(user => {
        if (user.id !== currentUserId) {
            sendInvitationEmail(user.email, roomId);
        }
    });

    res.redirect(`/chat/${roomId}`); // 생성된 채팅방으로 이동
});






const nodemailer = require('nodemailer');

async function sendInvitationEmail(toEmail, roomId) {
    let transporter = nodemailer.createTransport({
        service: 'gmail', // 혹은 다른 이메일 서비스
        auth: {
            user: 'YOUR_EMAIL@gmail.com',
            pass: 'YOUR_EMAIL_PASSWORD'
        }
    });

    let mailOptions = {
        from: 'YOUR_EMAIL@gmail.com',
        to: toEmail,
        subject: '새로운 채팅방에 초대되셨습니다!',
        html: `<p>안녕하세요!</p>
               <p>새로운 채팅방에 초대되셨습니다. 아래 링크를 클릭하여 참여하세요.</p>
               <a href="http://your-website.com/chat/${roomId}">채팅방 참여하기</a>`
    };

    await transporter.sendMail(mailOptions);
}






const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Cosmos DB chat 컨테이너 설정
const chartsdatabase = client.database("charts");
const chatsContainer = chartsdatabase.container("charts");

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('join room', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    socket.on('chat message', async (data) => {
        const { roomId, sender, message } = data;

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

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


app.post('/invite-to-room', (req, res) => {
    const { email, roomId } = req.body;
    sendInvitationEmail(email, roomId);
    res.status(200).send("초대 메일을 발송했습니다.");
});