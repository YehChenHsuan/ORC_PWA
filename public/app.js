require('dotenv').config();

// 初始化Tesseract
const worker = Tesseract.createWorker();

// 狀態管理
let currentMode = 'original'; // original | translate | sentence
let imageScale = 1;
let wordBoxes = [];
let sentenceBoxes = [];
let translationCache = {};

// 註冊Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker 註冊成功: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker 註冊失敗: ', err);
      });
  });
}

// 初始化UI元素
const loadingIndicator = document.createElement('div');
loadingIndicator.className = 'loading-indicator';
loadingIndicator.textContent = '處理中...';
document.querySelector('.container').appendChild(loadingIndicator);

const errorMessage = document.createElement('div');
errorMessage.className = 'error-message';
document.querySelector('.container').appendChild(errorMessage);

// 初始化UI事件
document.getElementById('originalBtn').addEventListener('click', () => {
  setMode('original');
});

document.getElementById('translateBtn').addEventListener('click', () => {
  setMode('translate');
});

document.getElementById('sentenceBtn').addEventListener('click', () => {
  setMode('sentence');
});

// 檢查語音功能支援
if (!('speechSynthesis' in window)) {
  showError('您的瀏覽器不支援語音功能');
}

// 檢查API金鑰
if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
  showError('請設定Google翻譯API金鑰');
  document.getElementById('translateBtn').disabled = true;
}

// 圖片上傳處理
const imageInput = document.getElementById('imageInput');
const resultDiv = document.getElementById('result');
const translationResultDiv = document.getElementById('translationResult');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
const highlightLayer = document.getElementById('highlightLayer');

// 改進圖片上傳處理
imageInput.addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) {
      showError('請選擇有效的圖片文件');
      return;
    }

    // 檢查文件類型
    if (!file.type.startsWith('image/')) {
      showError('請上傳圖片文件 (JPG, PNG, GIF 等)');
      return;
    }

    // 顯示載入狀態
    loadingIndicator.classList.add('visible');
    errorMessage.classList.remove('visible');
    resultDiv.innerHTML = '';
    translationResultDiv.innerHTML = '';
    clearHighlights();
    disableButtons(true);

    // 重置canvas
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.display = 'none';
    // 載入圖片
    const img = await loadImage(file);
    drawImage(img);
    canvas.classList.add('visible');
    highlightLayer.classList.add('visible');
    
    // 初始化Tesseract
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // 進行OCR識別
    const { data: { text, words } } = await worker.recognize(file);
    
    // 處理識別結果
    wordBoxes = words.map(word => ({
      text: word.text,
      bbox: word.bbox,
      confidence: word.confidence
    }));
    
    // 分組句子
    sentenceBoxes = groupWordsIntoSentences(wordBoxes);
    
    // 顯示結果
    displayText(text);
    updateHighlights();
  } catch (error) {
    console.error('OCR錯誤:', error);
    showError('發生錯誤，請重試');
  } finally {
    loadingIndicator.classList.remove('visible');
    disableButtons(false);
  }
});

// 圖片處理函數
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

function drawImage(img) {
  const maxWidth = 800;
  const maxHeight = 600;
  
  // 計算縮放比例
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
  imageScale = scale;
  
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
    // 顯示canvas
    canvas.classList.add('visible');
}

// 文字處理函數
function groupWordsIntoSentences(words) {
  // 實現句子分組邏輯
  // ...
}

function displayText(text) {
  const cleanedText = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' ');

  const words = cleanedText.split(' ');
  resultDiv.innerHTML = words
    .map(word => `<span onclick="handleWordClick('${word}')">${word}</span>`)
    .join(' ');
}

// 高亮處理
function updateHighlights() {
  highlightLayer.innerHTML = '';
  
  const boxes = currentMode === 'sentence' ? sentenceBoxes : wordBoxes;
  
  boxes.forEach(box => {
    const div = document.createElement('div');
    div.className = 'highlight-box';
    div.style.left = `${box.bbox.x0 * imageScale}px`;
    div.style.top = `${box.bbox.y0 * imageScale}px`;
    div.style.width = `${(box.bbox.x1 - box.bbox.x0) * imageScale}px`;
    div.style.height = `${(box.bbox.y1 - box.bbox.y0) * imageScale}px`;
    div.addEventListener('click', () => handleBoxClick(box));
    highlightLayer.appendChild(div);
  });
}

function clearHighlights() {
  highlightLayer.innerHTML = '';
}

// 事件處理
function handleWordClick(word) {
  if (currentMode === 'original') {
    speakWord(word);
    showTranslation(word, word);
  } else if (currentMode === 'translate') {
    translateAndSpeak(word);
  }
}

function handleBoxClick(box) {
  if (currentMode === 'sentence') {
    const text = box.text;
    if (currentMode === 'original') {
      speakSentence(text);
      showTranslation(text, text);
    } else if (currentMode === 'translate') {
      translateAndSpeak(text);
    }
  }
}

// 翻譯功能
async function translateAndSpeak(text) {
  try {
    const translation = await translateText(text);
    if (currentMode === 'translate') {
      speakWord(translation);
    }
    showTranslation(text, translation);
  } catch (error) {
    console.error('翻譯錯誤:', error);
    showTranslation(text, '翻譯失敗');
  }
}

async function translateText(text) {
  if (translationCache[text]) {
    return translationCache[text];
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        source: 'en',
        target: 'zh-TW',
        format: 'text'
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const translation = data.data.translations[0].translatedText;
    translationCache[text] = translation;
    return translation;
  } catch (error) {
    console.error('翻譯API錯誤:', error);
    throw error;
  }
}

function showTranslation(original, translation) {
  translationResultDiv.innerHTML = `
    <div><strong>原文:</strong> ${original}</div>
    <div><strong>翻譯:</strong> ${translation}</div>
  `;
}

// 語音功能
function speakWord(word) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = currentMode === 'translate' ? 'zh-TW' : 'en-US';
    window.speechSynthesis.speak(utterance);
  }
}

function speakSentence(sentence) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = currentMode === 'translate' ? 'zh-TW' : 'en-US';
    window.speechSynthesis.speak(utterance);
  }
}

// 模式切換
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.controls button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`${mode}Btn`).classList.add('active');
  updateHighlights();
}

// 顯示錯誤訊息
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('visible');
}

// 按鈕狀態控制
function disableButtons(disabled) {
  document.querySelectorAll('.controls button').forEach(btn => {
    btn.disabled = disabled;
  });
}
