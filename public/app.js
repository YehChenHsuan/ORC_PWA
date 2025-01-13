// 初始化Tesseract
let worker = null;

// 狀態管理
let currentMode = 'original'; // original | translate | sentence
let imageScale = 1;
let wordBoxes = [];
let sentenceBoxes = [];
let translationCache = {};

// 註冊Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('ServiceWorker 註冊成功: ', registration.scope);
    } catch (err) {
      console.log('ServiceWorker 註冊失敗: ', err);
    }
  });
}

// 初始化UI元素
const container = document.querySelector('.container');
const loadingIndicator = document.createElement('div');
loadingIndicator.className = 'loading-indicator';
loadingIndicator.textContent = '處理中...';
container.appendChild(loadingIndicator);

const errorMessage = document.createElement('div');
errorMessage.className = 'error-message';
container.appendChild(errorMessage);

// 初始化UI事件
document.getElementById('originalBtn').addEventListener('click', () => setMode('original'));
document.getElementById('translateBtn').addEventListener('click', () => setMode('translate'));
document.getElementById('sentenceBtn').addEventListener('click', () => setMode('sentence'));

// 檢查語音功能支援
if (!('speechSynthesis' in window)) {
  showError('您的瀏覽器不支援語音功能');
}

// 初始化UI元素
const imageInput = document.getElementById('imageInput');
const resultDiv = document.getElementById('result');
const translationResultDiv = document.getElementById('translationResult');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
const highlightLayer = document.getElementById('highlightLayer');

// 圖片上傳處理
imageInput.addEventListener('change', handleImageUpload);

// 圖片上傳處理函數
async function handleImageUpload(event) {
  try {
    const file = event.target.files[0];
    if (!file) {
      throw new Error('請選擇有效的圖片文件');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('請上傳圖片文件 (JPG, PNG, GIF 等)');
    }

    showLoading(true);
    clearUI();

    const img = await loadImage(file);
    drawImage(img);
    
    if (!worker) {
      worker = await initTesseract();
    }

    const { data: { text, words } } = await worker.recognize(file);
    
    processOCRResult(text, words);
    
  } catch (error) {
    console.error('OCR錯誤:', error);
    showError(error.message || '發生錯誤，請重試');
  } finally {
    showLoading(false);
  }
}

// 初始化 Tesseract
async function initTesseract() {
  const worker = Tesseract.createWorker();
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  return worker;
}

// 圖片處理函數
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片載入失敗'));
  });
}

function drawImage(img) {
  const maxWidth = 800;
  const maxHeight = 600;
  
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
  imageScale = scale;
  
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  canvas.classList.add('visible');
  highlightLayer.classList.add('visible');
}

// OCR 結果處理
function processOCRResult(text, words) {
  wordBoxes = words.map(word => ({
    text: word.text,
    bbox: word.bbox,
    confidence: word.confidence
  }));
  
  sentenceBoxes = groupWordsIntoSentences(wordBoxes);
  displayText(text);
  updateHighlights();
}

// 句子分組邏輯
function groupWordsIntoSentences(words) {
  const sentences = [];
  let currentSentence = {
    text: '',
    bbox: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    words: []
  };

  words.forEach((word, index) => {
    currentSentence.words.push(word);
    currentSentence.text += (currentSentence.text ? ' ' : '') + word.text;
    
    // 更新邊界框
    currentSentence.bbox.x0 = Math.min(currentSentence.bbox.x0, word.bbox.x0);
    currentSentence.bbox.y0 = Math.min(currentSentence.bbox.y0, word.bbox.y0);
    currentSentence.bbox.x1 = Math.max(currentSentence.bbox.x1, word.bbox.x1);
    currentSentence.bbox.y1 = Math.max(currentSentence.bbox.y1, word.bbox.y1);

    // 檢查是否為句子結尾
    if (word.text.match(/[.!?]$/) || index === words.length - 1) {
      sentences.push({ ...currentSentence });
      currentSentence = {
        text: '',
        bbox: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
        words: []
      };
    }
  });

  return sentences;
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

// UI 相關函數
function showLoading(show) {
  if (show) {
    loadingIndicator.classList.add('visible');
    disableButtons(true);
  } else {
    loadingIndicator.classList.remove('visible');
    disableButtons(false);
  }
}

function clearUI() {
  resultDiv.innerHTML = '';
  translationResultDiv.innerHTML = '';
  clearHighlights();
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.display = 'none';
  errorMessage.classList.remove('visible');
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

  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error('翻譯服務暫時無法使用');
    }

    const data = await response.json();
    translationCache[text] = data.translation;
    return data.translation;
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

// 錯誤處理
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
