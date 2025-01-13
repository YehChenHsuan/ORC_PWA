const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定靜態檔案目錄
app.use(express.static(path.join(__dirname, 'public')));

// 處理所有路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`伺服器運行在 http://localhost:${PORT}`);
});
