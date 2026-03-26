/**
 * FuturePredict - Core Logic (Multi-file Support)
 */

class RegressionEngine {
  static transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  static multiply(A, B) {
    const result = new Array(A.length).fill(0).map(() => new Array(B[0].length).fill(0));
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B[0].length; j++) {
        for (let k = 0; k < B.length; k++) {
          result[i][j] += (A[i][k] || 0) * (B[k][j] || 0);
        }
      }
    }
    return result;
  }

  static inverse(matrix) {
    const n = matrix.length;
    const identity = new Array(n).fill(0).map((_, i) => new Array(n).fill(0).map((_, j) => (i === j ? 1 : 0)));
    const copy = matrix.map(row => [...row]);

    for (let i = 0; i < n; i++) {
      let pivot = copy[i][i];
      if (Math.abs(pivot) < 1e-10) {
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(copy[k][i]) > Math.abs(pivot)) {
            [copy[i], copy[k]] = [copy[k], copy[i]];
            [identity[i], identity[k]] = [identity[k], identity[i]];
            pivot = copy[i][i];
            break;
          }
        }
      }
      if (Math.abs(pivot) < 1e-10) continue; // Singular

      for (let j = 0; j < n; j++) {
        copy[i][j] /= pivot;
        identity[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = copy[k][i];
          for (let j = 0; j < n; j++) {
            copy[k][j] -= factor * copy[i][j];
            identity[k][j] -= factor * identity[i][j];
          }
        }
      }
    }
    return identity;
  }

  static solve(X, y) {
    const X_with_intercept = X.map(row => [1, ...row]);
    const XT = this.transpose(X_with_intercept);
    const XTX = this.multiply(XT, X_with_intercept);
    const XTX_inv = this.inverse(XTX);
    const XTy = this.multiply(XT, y.map(val => [val]));
    const beta = this.multiply(XTX_inv, XTy);
    return beta.map(row => row[0]);
  }
}

// App State
const state = {
  mergedData: [], // Store for Excel export
  files: [], // Array of { name, headers, data }
  headers: [], // Merged headers
  data: [],    // Merged data
  targetIndex: -1,
  featureIndices: [],
  coefficients: null,
  chart: null
};

// UI Elements
const els = {
  csvInput: document.getElementById('csv-input'),
  uploadArea: document.getElementById('upload-area'),
  fileList: document.getElementById('file-list'),
  loadSample: document.getElementById('load-sample'),
  clearData: document.getElementById('clear-data'),
  mergeCard: document.getElementById('merge-card'),
  joinInfo: document.getElementById('join-info'),
  recommendations: document.getElementById('recommendations'),
  recommendationItems: document.getElementById('recommendation-items'),
  processMerge: document.getElementById('process-merge'),
  settingsCard: document.getElementById('settings-card'),
  targetSelect: document.getElementById('target-select'),
  featuresCheckboxes: document.getElementById('features-checkboxes'),
  runAnalysis: document.getElementById('run-analysis'),
  summaryCard: document.getElementById('summary-card'),
  rSquared: document.getElementById('r-squared'),
  adjRSquared: document.getElementById('adj-r-squared'),
  simulatorCard: document.getElementById('simulator-card'),
  simulatorInputs: document.getElementById('simulator-inputs'),
  predictedValue: document.getElementById('predicted-value'),
  dataViewCard: document.getElementById('data-view-card'),
  tableHead: document.getElementById('table-head'),
  tableBody: document.getElementById('table-body')
};

// Initialization
function init() {
  els.uploadArea.onclick = () => els.csvInput.click();
  els.csvInput.onchange = (e) => handleFiles(e.target.files);
  els.loadSample.onclick = loadSampleData;
  els.clearData.onclick = () => location.reload();
  els.processMerge.onclick = processMerge;
  els.runAnalysis.onclick = runAnalysis;

  // Drag and Drop
  els.uploadArea.ondragover = (e) => { e.preventDefault(); els.uploadArea.classList.add('active'); };
  els.uploadArea.ondragleave = () => els.uploadArea.classList.remove('active');
  els.uploadArea.ondrop = (e) => {
    e.preventDefault();
    els.uploadArea.classList.remove('active');
    handleFiles(e.dataTransfer.files);
  };
}

async function handleFiles(files) {
  for (const file of files) {
    const text = await file.text();
    addFile(file.name, text);
  }
}

function addFile(name, text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line => line.split(',').map(v => {
    const val = v.trim();
    // Improved numeric check: ignore hex, dates, etc.
    if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
    return val;
  }));

  state.files.push({ name, headers, data });
  renderFileList();
  els.mergeCard.style.display = 'block';
  els.mergeCard.classList.add('reveal');
}

function renderFileList() {
  els.fileList.innerHTML = state.files.map((f, i) => `
    <div class="file-item">
      <div class="file-info">
        <span class="file-name">${f.name}</span>
        <span class="file-meta">${f.headers.length} 列 / ${f.data.length} 行</span>
      </div>
      <i class="remove-file" onclick="removeFile(${i})">✕</i>
    </div>
  `).join('');
}

window.removeFile = (index) => {
  state.files.splice(index, 1);
  renderFileList();
  if (state.files.length === 0) {
    els.mergeCard.style.display = 'none';
    els.settingsCard.style.display = 'none';
  }
};

function processMerge() {
  if (state.files.length === 1) {
    state.headers = state.files[0].headers;
    state.data = state.files[0].data;
  } else {
    const headerCounts = {};
    state.files.forEach(f => f.headers.forEach(h => headerCounts[h] = (headerCounts[h] || 0) + 1));
    const commonHeaders = Object.keys(headerCounts).filter(h => headerCounts[h] > 1);
    
    let joinKey = commonHeaders.find(h => h.includes('日') || h.includes('Date') || h.includes('ID'));
    if (!joinKey && commonHeaders.length > 0) joinKey = commonHeaders[0];

    if (joinKey) {
      els.joinInfo.innerText = `「${joinKey}」をキーとしてデータを統合しました。`;
      mergeByKey(joinKey);
    } else {
      els.joinInfo.innerText = `共通キーが見つかりません。行番号で結合しました。`;
      mergeByIndex();
    }
  }

  state.mergedData = state.data; // Store the final merged data for export
  showSetup();
  renderTable();
  analyzeCorrelations();
}

function mergeByKey(key) {
  const mainFile = state.files[0];
  const keyIdx = mainFile.headers.indexOf(key);
  
  const mergedHeaders = [...mainFile.headers];
  const mergedDataMap = new Map();
  
  mainFile.data.forEach(row => mergedDataMap.set(row[keyIdx], [...row]));

  const keysAdded = new Set();
  for (let i = 1; i < state.files.length; i++) {
    const f = state.files[i];
    const fKeyIdx = f.headers.indexOf(key);
    
    f.headers.forEach((h, idx) => {
      if (idx !== fKeyIdx) mergedHeaders.push(h);
    });

    f.data.forEach(row => {
      const kVal = row[fKeyIdx];
      if (mergedDataMap.has(kVal)) {
        const existingRow = mergedDataMap.get(kVal);
        const otherVals = row.filter((_, idx) => idx !== fKeyIdx);
        existingRow.push(...otherVals);
      }
    });
  }

  state.headers = mergedHeaders;
  state.data = Array.from(mergedDataMap.values()).filter(row => row.length === mergedHeaders.length);
}

function mergeByIndex() {
  const minRows = Math.min(...state.files.map(f => f.data.length));
  state.headers = state.files.flatMap(f => f.headers);
  state.data = [];
  for (let i = 0; i < minRows; i++) {
    state.data.push(state.files.flatMap(f => f.data[i]));
  }
}

function analyzeCorrelations() {
  const targetIdx = state.headers.length - 1;
  const correlations = [];

  state.headers.forEach((h, i) => {
    if (i === targetIdx) return;
    const x = state.data.map(row => row[i]);
    const y = state.data.map(row => row[targetIdx]);
    
    if (x.some(v => typeof v !== 'number') || y.some(v => typeof v !== 'number')) return;

    const r = calculatePearson(x, y);
    if (!isNaN(r)) correlations.push({ name: h, index: i, r });
  });

  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  if (correlations.length > 0) {
    els.recommendations.style.display = 'block';
    els.recommendationItems.innerHTML = correlations
      .slice(0, 3)
      .map(c => `
        <div class="recommendation-item">
          <span style="display: flex; align-items: center; gap: 0.5rem;">
            <i style="color: #10b981;">💡</i> 
            <span>「<b>${c.name}</b>」は「目的変数」に対して強い影響 (10段階で${Math.abs(c.r * 10).toFixed(1)}程度) が認められます。</span>
          </span>
        </div>
      `).join('');
  } else {
    els.recommendations.style.display = 'none';
  }
}

function calculatePearson(x, y) {
  const n = x.length;
  if (n < 2) return NaN;
  const meanX = x.reduce((a, b) => a + b) / n;
  const meanY = y.reduce((a, b) => a + b) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function loadSampleData() {
  const file1 = `日付,広告費,イベント数
2026-03-01,50,2
2026-03-02,60,3
2026-03-03,40,1
2026-03-04,80,5
2026-03-05,30,1
2026-03-06,70,4
2026-03-07,90,6`;
  const file2 = `日付,気温,湿度,売上
2026-03-01,25,60,500
2026-03-02,28,65,620
2026-03-03,22,55,410
2026-03-04,30,70,890
2026-03-05,20,50,320
2026-03-06,32,68,810
2026-03-07,35,75,1050`;
  state.files = []; // Reset first
  addFile('marketing.csv', file1);
  addFile('weather_sales.csv', file2);
}

function showSetup() {
  els.settingsCard.style.display = 'block';
  els.settingsCard.classList.add('reveal');
  els.dataViewCard.style.display = 'block';
  els.dataViewCard.classList.add('reveal');

  els.targetSelect.innerHTML = state.headers.map((h, i) => `<option value="${i}" ${i === state.headers.length - 1 ? 'selected' : ''}>${h}</option>`).join('');
  renderCheckboxes();
}

function renderCheckboxes() {
  const targetIdx = parseInt(els.targetSelect.value);
  els.featuresCheckboxes.innerHTML = state.headers
    .map((h, i) => {
      if (i === targetIdx || typeof state.data[0][i] !== 'number') return '';
      return `
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" name="feature" value="${i}" checked style="width: auto;">
          <span>${h}</span>
        </label>
      `;
    })
    .join('');
}

function renderTable() {
  els.tableHead.innerHTML = `<tr>${state.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  els.tableBody.innerHTML = state.data
    .slice(0, 10)
    .map(row => `<tr>${row.map(v => `<td>${v}</td>`).join('')}</tr>`)
    .join('');
}

function runAnalysis() {
  const targetIdx = parseInt(els.targetSelect.value);
  const selectedFeatures = Array.from(document.querySelectorAll('input[name="feature"]:checked')).map(cb => parseInt(cb.value));

  if (selectedFeatures.length === 0) {
    alert('少なくとも1つの説明変数を選択してください。');
    return;
  }

  const cleanData = state.data.filter(row => {
    const vals = [row[targetIdx], ...selectedFeatures.map(idx => row[idx])];
    return vals.every(v => typeof v === 'number' && !isNaN(v));
  });

  if (cleanData.length <= selectedFeatures.length + 1) {
    alert('データ件数が不足しています。');
    return;
  }

  const X = cleanData.map(row => selectedFeatures.map(idx => row[idx]));
  const y = cleanData.map(row => row[targetIdx]);

  try {
    const beta = RegressionEngine.solve(X, y);
    state.coefficients = beta;
    state.targetIndex = targetIdx;
    state.featureIndices = selectedFeatures;
    displayResults(beta, X, y);
  } catch (err) {
    alert('分析エラー: データを確認してください。');
  }
}

function displayResults(beta, X, y) {
  els.summaryCard.style.display = 'block';
  els.summaryCard.classList.add('reveal');
  els.simulatorCard.style.display = 'block';
  els.simulatorCard.classList.add('reveal');

  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const yPred = X.map(row => {
    let sum = beta[0];
    row.forEach((v, i) => sum += v * beta[i + 1]);
    return sum;
  });

  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  let rss = 0;
  for (let i = 0; i < y.length; i++) rss += Math.pow(y[i] - yPred[i], 2);
  
  const r2 = 1 - (rss / ssTot);
  const n = y.length;
  const p = state.featureIndices.length;
  const adjR2 = (n - p - 1) === 0 ? r2 : 1 - ((1 - r2) * (n - 1) / (n - p - 1));

  // Beginner-friendly score (0-100)
  const score = Math.max(0, Math.min(100, Math.round(r2 * 100)));
  els.rSquared.innerText = score;
  els.adjRSquared.innerText = isNaN(adjR2) ? '-' : (adjR2 * 100).toFixed(1);

  renderChart(y, yPred);
  renderSimulator();
}

function renderChart(actual, predicted) {
  const ctx = document.getElementById('prediction-chart').getContext('2d');
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        { label: '実績値 vs 予測値', data: actual.map((v, i) => ({ x: v, y: predicted[i] })), backgroundColor: '#6366f1' },
        { label: '理想線', data: [{ x: Math.min(...actual), y: Math.min(...actual) }, { x: Math.max(...actual), y: Math.max(...actual) }], type: 'line', borderColor: 'rgba(255,255,255,0.2)', borderDash: [5,5], pointRadius:0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: '実績値 (Actual)', color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: '予測値 (Predicted)', color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderSimulator() {
  els.simulatorInputs.innerHTML = state.featureIndices
    .map((idx, i) => `<div><label>${state.headers[idx]}</label><input type="number" class="sim-input" data-idx="${i}" value="${state.data[0][idx]}"></div>`)
    .join('');
  document.querySelectorAll('.sim-input').forEach(input => input.oninput = updatePrediction);
  updatePrediction();
}

function updatePrediction() {
  if (!state.coefficients) return;
  const inputs = Array.from(document.querySelectorAll('.sim-input')).map(el => parseFloat(el.value) || 0);
  let result = state.coefficients[0];
  inputs.forEach((val, i) => {
    if (state.coefficients[i + 1] !== undefined) {
      result += val * state.coefficients[i + 1];
    }
  });
  els.predictedValue.innerText = result.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// --- Export Functions ---

function exportToExcel() {
  if (!state.mergedData || state.mergedData.length === 0) {
    alert("出力するデータがありません。");
    return;
  }
  const dataAsObjects = state.mergedData.map(row => {
    const obj = {};
    state.headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(dataAsObjects);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "MergedData");
  XLSX.writeFile(workbook, "FuturePredict_Integrated_Data.xlsx");
}

async function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const element = document.getElementById("summary-card");
  
  if (!element || element.style.display === "none") {
    alert("解析結果が表示されていません。分析を実行してください。");
    return;
  }

  const btn = document.getElementById("export-pdf");
  const originalText = btn.innerText;
  btn.innerText = "生成中...";
  btn.disabled = true;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: "#030711",
      scale: 2,
      useCORS: true,
      logging: false
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, Math.min(pdfHeight, 297));
    pdf.save("FuturePredict_Analysis_Report.pdf");
  } catch (error) {
    console.error("PDF Export Error:", error);
    alert("PDFの出力に失敗しました。");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

// --- Init & Events ---

function init() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const sampleBtn = document.getElementById('sample-btn');
  const clearBtn = document.getElementById('clear-btn');
  const processMergeBtn = document.getElementById('process-merge');
  const runAnalysisBtn = document.getElementById('run-analysis');
  const exportExcelBtn = document.getElementById('export-excel');
  const exportPdfBtn = document.getElementById('export-pdf');

  // Event Listeners
  if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportToExcel);
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPDF);
  
  if (dropZone) {
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'var(--border)'; };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      handleFiles(e.dataTransfer.files);
    };
  }

  if (fileInput) fileInput.onchange = (e) => handleFiles(e.target.files);
  if (sampleBtn) sampleBtn.onclick = () => { loadSampleData(); showMergeUI(); };
  if (clearBtn) clearBtn.onclick = () => location.reload();
  if (processMergeBtn) processMergeBtn.onclick = () => { processMerge(); };
  if (runAnalysisBtn) runAnalysisBtn.onclick = runAnalysis;

  if (els.targetSelect) {
    els.targetSelect.onchange = renderCheckboxes;
  }
}

init();
