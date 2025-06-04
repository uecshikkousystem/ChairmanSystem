// script.js の先頭
// TODO: Firebaseプロジェクトからコピーした設定情報を貼り付けてください
const firebaseConfig = {
    apiKey: "AIzaSyCZOsfyAH0xiF7b9jjpXA4C1Zt1DlIMoAU",
    authDomain: "shikkouchairmansystem.firebaseapp.com",
    projectId: "shikkouchairmansystem",
    storageBucket: "shikkouchairmansystem.firebasestorage.app",
    messagingSenderId: "501602223891",
    appId: "1:501602223891:web:6145c706016262d148fce6"
};

// Firebaseを初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); // Firestoreインスタンスを取得

// DOM要素の取得 (よく使うものを最初にまとめて取得しておくと便利)
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const modeSwitcher = document.getElementById('modeSwitcher');
const timerModeDiv = document.getElementById('timerMode');
const votingModeDiv = document.getElementById('votingMode');

// --- 現在時刻表示 ---
function updateCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    currentTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}
setInterval(updateCurrentTime, 1000); // 1秒ごとに時刻を更新
updateCurrentTime(); // 最初に一度呼び出して表示

// --- モード切替 ---
modeSwitcher.addEventListener('change', function() {
    if (this.value === 'timer') {
        timerModeDiv.style.display = 'block';
        votingModeDiv.style.display = 'none';
    } else if (this.value === 'voting') {
        timerModeDiv.style.display = 'none';
        votingModeDiv.style.display = 'block';
        // 票決モードに切り替えたら、議長委任票の表示を多数決タイプに応じて更新
        updateProxyVoteFieldVisibility();
    }
});

// --- タイマーモード関連のDOM要素 ---
const timerPresetsDiv = document.getElementById('timerPresets');
const timerDisplay = document.getElementById('timerDisplay');
const endTimeDisplay = document.getElementById('endTimeDisplay');
const startTimerButton = document.getElementById('startTimerButton');
const resetTimerButton = document.getElementById('resetTimerButton');

// (裏設定用)
// const targetTimeInput = document.getElementById('targetTimeInput');
// const startTargetTimeTimerButton = document.getElementById('startTargetTimeTimerButton');
// const targetTimeRemainingDisplay = document.getElementById('targetTimeRemainingDisplay');


let timerInterval = null; // タイマーのsetIntervalのIDを保持
let remainingSeconds = 0; // 残り秒数
let selectedPresetDuration = 0; // 選択されたプリセットの時間（秒）

// --- プリセット時間のFirestoreからの読み込みとボタン生成 ---
async function loadTimerPresets() {
    try {
        const snapshot = await db.collection('timerPresets').orderBy('durationSeconds').get();
        snapshot.forEach(doc => {
            const preset = doc.data();
            const button = document.createElement('button');
            button.textContent = preset.name;
            button.dataset.seconds = preset.durationSeconds; // カスタムデータ属性に秒数を格納
            button.addEventListener('click', function() {
                selectedPresetDuration = parseInt(this.dataset.seconds);
                remainingSeconds = selectedPresetDuration;
                updateTimerDisplay(remainingSeconds);
                calculateAndDisplayEndTime(remainingSeconds);
                if (timerInterval) clearInterval(timerInterval); // 既存のタイマーがあれば停止
                startTimerButton.disabled = false;
            });
            timerPresetsDiv.appendChild(button);
        });
    } catch (error) {
        console.error("Error loading timer presets: ", error);
        timerPresetsDiv.textContent = "プリセットの読み込みに失敗しました。";
    }
}

loadTimerPresets(); // ページ読み込み時にプリセットを読み込む

// --- タイマー表示更新 ---
function updateTimerDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// --- 終了時刻の計算と表示 ---
function calculateAndDisplayEndTime(durationSeconds) {
    if (durationSeconds <= 0) {
        endTimeDisplay.textContent = "終了時刻: --:--";
        return;
    }
    const now = new Date();
    const endTime = new Date(now.getTime() + durationSeconds * 1000);
    const endHours = String(endTime.getHours()).padStart(2, '0');
    const endMinutes = String(endTime.getMinutes()).padStart(2, '0');
    endTimeDisplay.textContent = `終了時刻: ${endHours}:${endMinutes}`;
}

// --- タイマースタート処理 ---
startTimerButton.addEventListener('click', function() {
    if (remainingSeconds <= 0) return; // 残り時間がなければ何もしない
    if (timerInterval) clearInterval(timerInterval); // 既に動いていたら止める

    calculateAndDisplayEndTime(remainingSeconds); // スタート時にも終了時刻を再計算・表示
    this.disabled = true; // スタートボタンを無効化

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay(remainingSeconds);
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = "終了!";
            endTimeDisplay.textContent = "終了時刻: --:--";
            // 必要なら音を鳴らすなどの処理を追加
            // alert("時間です！");
            startTimerButton.disabled = false; // スタートボタンを再度有効化
        }
    }, 1000);
});

// --- タイマーリセット処理 ---
resetTimerButton.addEventListener('click', function() {
    clearInterval(timerInterval);
    timerInterval = null;
    remainingSeconds = selectedPresetDuration > 0 ? selectedPresetDuration : 0; // 選択プリセットがあればその時間、なければ0
    updateTimerDisplay(remainingSeconds);
    if (selectedPresetDuration > 0) {
        calculateAndDisplayEndTime(remainingSeconds);
    } else {
        endTimeDisplay.textContent = "終了時刻: --:--";
    }
    startTimerButton.disabled = (remainingSeconds <= 0);
});

// --- (裏設定) 時刻指定タイマー ---
// コメントアウトを外して使用する場合は、HTML側のコメントアウトも外してください。
/*
startTargetTimeTimerButton.addEventListener('click', function() {
    const targetTimeValue = targetTimeInput.value; // "HH:MM"
    if (!targetTimeValue) {
        alert("目標時刻を入力してください。");
        return;
    }

    const [hours, minutes] = targetTimeValue.split(':');
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    if (targetDate <= now) {
        alert("目標時刻は現在時刻より未来の時刻を指定してください。");
        return;
    }

    remainingSeconds = Math.floor((targetDate - now) / 1000);
    selectedPresetDuration = 0; // プリセット選択ではないのでリセット
    updateTimerDisplay(remainingSeconds);
    endTimeDisplay.textContent = `終了時刻: ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;

    if (timerInterval) clearInterval(timerInterval);
    startTimerButton.disabled = true; // 通常のスタートボタンは一旦無効化

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay(remainingSeconds);
        targetTimeRemainingDisplay.textContent = `目標時刻まであと ${formatTime(remainingSeconds)}`; // 裏設定用表示

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = "目標時刻です!";
            targetTimeRemainingDisplay.textContent = "";
            // alert("目標時刻です！");
            startTimerButton.disabled = false;
        }
    }, 1000);
});

function formatTime(totalSeconds) { // 裏設定用ヘルパー
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
*/

// --- 票決モード関連のDOM要素 ---
const majorityTypeSelect = document.getElementById('majorityType');
const aye1Input = document.getElementById('aye1');
const aye2Input = document.getElementById('aye2');
const aye3Input = document.getElementById('aye3');
const nay1Input = document.getElementById('nay1');
const nay2Input = document.getElementById('nay2');
const nay3Input = document.getElementById('nay3');
const proxyVoteInput = document.getElementById('proxyVote');
const proxyVoteField = document.getElementById('proxyVoteField'); // 議長委任票のfieldset
const calculateVoteButton = document.getElementById('calculateVoteButton');
const voteCalculationFormulaDiv = document.getElementById('voteCalculationFormula');
const voteResultDiv = document.getElementById('voteResult');
const saveVoteResultButton = document.getElementById('saveVoteResultButton');

let lastVoteResultData = null; // 最後に計算した票決結果を保存

// --- 多数決タイプ変更時の処理 ---
majorityTypeSelect.addEventListener('change', updateProxyVoteFieldVisibility);

function updateProxyVoteFieldVisibility() {
    if (majorityTypeSelect.value === 'simple') {
        proxyVoteField.style.display = 'none'; // 単純多数決なら議長委任票を非表示
    } else {
        proxyVoteField.style.display = 'block'; // 完全多数決なら表示
    }
    // タイプ変更時に計算結果をクリア
    voteCalculationFormulaDiv.textContent = "計算式: ";
    voteResultDiv.textContent = "結果: ";
    saveVoteResultButton.style.display = 'none';
    lastVoteResultData = null;
}
// 初期表示のために呼び出し
updateProxyVoteFieldVisibility();


// --- 票決計算処理 ---
calculateVoteButton.addEventListener('click', function() {
    const aye1 = parseInt(aye1Input.value) || 0;
    const aye2 = parseInt(aye2Input.value) || 0;
    const aye3 = parseInt(aye3Input.value) || 0;
    const nay1 = parseInt(nay1Input.value) || 0;
    const nay2 = parseInt(nay2Input.value) || 0;
    const nay3 = parseInt(nay3Input.value) || 0;
    let proxyVote = parseInt(proxyVoteInput.value) || 0;

    const totalAyeVotes = (aye1 * 1) + (aye2 * 2) + (aye3 * 3);
    const totalNayVotes = (nay1 * 1) + (nay2 * 2) + (nay3 * 3);

    let finalAye = totalAyeVotes;
    let finalNay = totalNayVotes;
    let resultText = "";
    let formulaText = "";

    const majorityType = majorityTypeSelect.value;

    if (majorityType === 'absolute') { // 完全多数決
        if (totalAyeVotes > totalNayVotes) {
            finalAye += proxyVote;
        } else if (totalNayVotes > totalAyeVotes) {
            finalNay += proxyVote;
        } else {
            // 同数の場合は、議長委任票をどうするかルールを決める必要がある
            // ここでは例として賛成に加算（または別途ルールを定める）
            // finalAye += proxyVote;
            // alert("賛否同数のため、議長委任票はルールに従い処理してください。ここでは一旦賛成に加算します。");
            // このケースは要件で明確でなかったので、一旦何もしないか、仕様確認が必要です。
            // ここでは、明確な差がない場合は議長委任票は加算しないという動作にします。
        }
        formulaText = `賛成: (1票×${aye1} + 2票×${aye2} + 3票×${aye3}) = ${totalAyeVotes}\n` +
                      `反対: (1票×${nay1} + 2票×${nay2} + 3票×${nay3}) = ${totalNayVotes}\n` +
                      `議長委任票(${proxyVote})を ${totalAyeVotes > totalNayVotes ? '賛成' : (totalNayVotes > totalAyeVotes ? '反対' : '影響なし')} に加算\n` +
                      `最終賛成: ${finalAye}, 最終反対: ${finalNay}`;

    } else { // 単純多数決
        // 議長委任票は計算に含めない
        proxyVote = 0; // 計算式表示のために0にする
        formulaText = `賛成: (1票×${aye1} + 2票×${aye2} + 3票×${aye3}) = ${totalAyeVotes}\n` +
                      `反対: (1票×${nay1} + 2票×${nay2} + 3票×${nay3}) = ${totalNayVotes}\n` +
                      `最終賛成: ${finalAye}, 最終反対: ${finalNay}`;
    }

    if (finalAye > finalNay) {
        resultText = "可決 (賛成多数)";
    } else if (finalNay > finalAye) {
        resultText = "否決 (反対多数)";
    } else {
        resultText = "同数";
    }

    voteCalculationFormulaDiv.innerText = `計算式:\n${formulaText}`; // innerTextで改行を反映
    voteResultDiv.textContent = `結果: ${resultText}`;
    saveVoteResultButton.style.display = 'inline-block'; // 保存ボタン表示

    // 保存用データを作成
    lastVoteResultData = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Firestoreサーバーの時刻
        majorityType: majorityType,
        ayeCounts: { count1: aye1, count2: aye2, count3: aye3 },
        nayCounts: { count1: nay1, count2: nay2, count3: nay3 },
        proxyVoteCount: (majorityType === 'absolute' ? proxyVote : 0), // 単純多数決では0
        totalAye: totalAyeVotes,
        totalNay: totalNayVotes,
        finalAye: finalAye,
        finalNay: finalNay,
        result: resultText,
        formula: formulaText
    };
});

// --- 票決結果のFirestoreへの保存 ---
saveVoteResultButton.addEventListener('click', async function() {
    if (!lastVoteResultData) {
        alert("保存する計算結果がありません。");
        return;
    }
    try {
        const docRef = await db.collection('votingResults').add(lastVoteResultData);
        console.log("Document written with ID: ", docRef.id);
        alert("票決結果を保存しました！");
        saveVoteResultButton.style.display = 'none'; // 保存後は非表示
        lastVoteResultData = null; // 保存したのでクリア
    } catch (error) {
        console.error("Error adding document: ", error);
        alert("結果の保存に失敗しました。");
    }
});