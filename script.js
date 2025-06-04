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

// --- 初期表示モードの設定 ---
document.addEventListener('DOMContentLoaded', () => {
    // modeSwitcher の初期値に基づいて表示を切り替える
    // HTMLのセレクトボックスで timer が最初に選択されていれば、
    // 以下のif文は timerModeDiv を表示し、votingModeDiv を非表示にする。
    // HTML側で style="display:none;" を votingModeDiv に設定済みなので、
    // この処理は冗長かもしれないが、JS側でも明示的に制御する例として。

    const initialMode = modeSwitcher.value; // <select>の現在の値を取得
    if (initialMode === 'timer') {
        timerModeDiv.style.display = 'block';
        votingModeDiv.style.display = 'none';
    } else if (initialMode === 'voting') {
        timerModeDiv.style.display = 'none';
        votingModeDiv.style.display = 'block';
        updateProxyVoteFieldVisibility(); // 票決モード初期表示時にも必要
    }
    // 必要であれば、他の初期化処理もここに追加
});


// --- モード切替 (既存のコード) ---
modeSwitcher.addEventListener('change', function() {
    if (this.value === 'timer') {
        timerModeDiv.style.display = 'block';
        votingModeDiv.style.display = 'none';
    } else if (this.value === 'voting') {
        timerModeDiv.style.display = 'none';
        votingModeDiv.style.display = 'block';
        updateProxyVoteFieldVisibility(); // 票決モードに切り替えたら、議長委任票の表示を更新
    }
});

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
const targetTimeInput = document.getElementById('targetTimeInput');
const startTargetTimeTimerButton = document.getElementById('startTargetTimeTimerButton');
const targetTimeRemainingDisplay = document.getElementById('targetTimeRemainingDisplay');


let timerInterval = null; // タイマーのsetIntervalのIDを保持
let remainingSeconds = 0; // 残り秒数
let selectedPresetDuration = 0; // 選択されたプリセットの時間（秒）
const totalPresetClicksDisplay = document.getElementById('totalPresetClicksDisplay'); // 合計回数表示用

let currentPresetDocId = null;
let presetClickCounts = {}; // { presetId1: count1, presetId2: count2, ... }


// --- プリセット時間のFirestoreからの読み込みとボタン生成 (修正) ---
async function loadTimerPresets() {
    try {
        const snapshot = await db.collection('timerPresets').orderBy('durationSeconds').get();
        timerPresetsDiv.innerHTML = ''; // 既存のボタンをクリア
        let totalClicks = 0; // 全プリセットの合計クリック数を計算するための変数

        snapshot.forEach(doc => {
            const preset = doc.data();
            const presetId = doc.id;
            const currentCount = preset.clickCount || 0;
            presetClickCounts[presetId] = currentCount;
            totalClicks += currentCount; // 合計に加算

            const wrapper = document.createElement('div'); // ボタンと回数をまとめるラッパー
            wrapper.classList.add('preset-button-wrapper');

            const button = document.createElement('button');
            button.textContent = preset.name;
            button.dataset.seconds = preset.durationSeconds;
            button.dataset.id = presetId;

            const countDisplay = document.createElement('div'); // divに変更してボタンの直下に
            countDisplay.id = `count-${presetId}`;
            countDisplay.classList.add('preset-click-count');
            countDisplay.textContent = `${currentCount}`;

            button.addEventListener('click', async function() {
                selectedPresetDuration = parseInt(this.dataset.seconds);
                currentPresetDocId = this.dataset.id;

                remainingSeconds = selectedPresetDuration;
                updateTimerDisplay(remainingSeconds);
                calculateAndDisplayEndTime(remainingSeconds);
                if (timerInterval) clearInterval(timerInterval);
                startTimerButton.disabled = false;

                try {
                    // Firestoreのカウントをインクリメント (アトミック操作)
                    const presetRef = db.collection('timerPresets').doc(currentPresetDocId);
                    await presetRef.update({
                        clickCount: firebase.firestore.FieldValue.increment(1)
                    });

                    // ローカルのカウントと表示を更新
                    presetClickCounts[currentPresetDocId]++;
                    document.getElementById(`count-${currentPresetDocId}`).textContent = `${presetClickCounts[currentPresetDocId]}`;

                    // 合計クリック数を更新
                    updateTotalClicksDisplay();

                    console.log(`Preset ${preset.name} count incremented`);
                } catch (error) {
                    console.error("Error updating preset click count: ", error);
                }
            });

            wrapper.appendChild(button);
            wrapper.appendChild(countDisplay);
            timerPresetsDiv.appendChild(wrapper);
        });

        // 初回ロード時に合計クリック数を表示
        updateTotalClicksDisplay();

    } catch (error) {
        console.error("Error loading timer presets: ", error);
        timerPresetsDiv.textContent = "プリセットの読み込みに失敗しました。";
        totalPresetClicksDisplay.textContent = "エラー";
    }
}

// --- タイマーリセット処理 (全体リセットに修正) ---
resetTimerButton.addEventListener('click', async function() {
    clearInterval(timerInterval);
    timerInterval = null;
    remainingSeconds = 0;
    updateTimerDisplay(remainingSeconds); // タイマー表示を 00:00 に
    endTimeDisplay.textContent = "終了時刻: --:--";
    startTimerButton.disabled = true; // スタートボタンは選択されるまで無効

    // ★★★ 全てのプリセットのクリック回数を0にリセット ★★★
    try {
        const presetsQuerySnapshot = await db.collection('timerPresets').get();
        const batch = db.batch(); // バッチ処理を開始

        presetsQuerySnapshot.forEach(doc => {
            const presetRef = db.collection('timerPresets').doc(doc.id);
            batch.update(presetRef, { clickCount: 0 }); // バッチに更新操作を追加

            // ローカルのカウントと表示もリセット
            presetClickCounts[doc.id] = 0;
            const countDisplayElement = document.getElementById(`count-${doc.id}`);
            if (countDisplayElement) {
                countDisplayElement.textContent = `0回`;
            }
        });

        await batch.commit(); // バッチ処理を実行してFirestoreを更新
        console.log("All preset counts have been reset to 0 in Firestore.");

        // 合計クリック数を更新
        updateTotalClicksDisplay();

    } catch (error) {
        console.error("Error resetting all preset click counts: ", error);
        // エラーが発生した場合でも、ローカルの表示だけでもリセットを試みる
        for (const presetId in presetClickCounts) {
            presetClickCounts[presetId] = 0;
            const countDisplayElement = document.getElementById(`count-${presetId}`);
            if (countDisplayElement) {
                countDisplayElement.textContent = `0回`;
            }
        }
        updateTotalClicksDisplay(); // ローカルだけでも合計を更新
        alert("一部またはすべてのプリセット回数のリセットに失敗しました。画面表示はリセットされます。");
    }

    selectedPresetDuration = 0; // 選択されていたプリセットの時間をリセット
    currentPresetDocId = null; // 選択されているプリセットIDもリセット
});

// --- プリセット時間のFirestoreからの読み込みとボタン生成 (ほぼ変更なし、確認のため記載) ---
async function loadTimerPresets() {
    try {
        const snapshot = await db.collection('timerPresets').orderBy('durationSeconds').get();
        timerPresetsDiv.innerHTML = '';
        let totalClicks = 0;

        snapshot.forEach(doc => {
            const preset = doc.data();
            const presetId = doc.id;
            const currentCount = preset.clickCount || 0;
            presetClickCounts[presetId] = currentCount; // ★重要: presetClickCounts をここで初期化
            totalClicks += currentCount;

            const wrapper = document.createElement('div');
            wrapper.classList.add('preset-button-wrapper');

            const button = document.createElement('button');
            button.textContent = preset.name;
            button.dataset.seconds = preset.durationSeconds;
            button.dataset.id = presetId;

            const countDisplay = document.createElement('div');
            countDisplay.id = `count-${presetId}`;
            countDisplay.classList.add('preset-click-count');
            countDisplay.textContent = `${currentCount}回`;

            button.addEventListener('click', async function() {
                selectedPresetDuration = parseInt(this.dataset.seconds);
                currentPresetDocId = this.dataset.id;

                remainingSeconds = selectedPresetDuration;
                updateTimerDisplay(remainingSeconds);
                calculateAndDisplayEndTime(remainingSeconds);
                if (timerInterval) clearInterval(timerInterval);
                startTimerButton.disabled = false;

                try {
                    const presetRef = db.collection('timerPresets').doc(currentPresetDocId);
                    await presetRef.update({
                        clickCount: firebase.firestore.FieldValue.increment(1)
                    });

                    presetClickCounts[currentPresetDocId]++;
                    document.getElementById(`count-${currentPresetDocId}`).textContent = `${presetClickCounts[currentPresetDocId]}回`;
                    updateTotalClicksDisplay();
                    console.log(`Preset ${preset.name} count incremented`);
                } catch (error) {
                    console.error("Error updating preset click count: ", error);
                }
            });

            wrapper.appendChild(button);
            wrapper.appendChild(countDisplay);
            timerPresetsDiv.appendChild(wrapper);
        });
        updateTotalClicksDisplay();
    } catch (error) {
        console.error("Error loading timer presets: ", error);
        timerPresetsDiv.textContent = "プリセットの読み込みに失敗しました。";
        totalPresetClicksDisplay.textContent = "合計回数:エラー";
    }
}

// --- 合計クリック数表示を更新する関数 (変更なし) ---
function updateTotalClicksDisplay() {
    let sum = 0;
    for (const id in presetClickCounts) {
        sum += presetClickCounts[id];
    }
    totalPresetClicksDisplay.textContent = `合計回数:${sum}回`;
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

// --- タイマースタート処理 (修正) ---
// スタートボタンのdisabled状態はプリセット選択時に制御するので、
// リセット時に selectedPresetDuration や remainingSeconds が 0 になることで、
// スタートボタンが押せないようにする。
startTimerButton.addEventListener('click', function() {
    if (remainingSeconds <= 0 || selectedPresetDuration <= 0) { // selectedPresetDurationもチェック
        alert("タイマー時間を選択してください。");
        return;
    }
    if (timerInterval) clearInterval(timerInterval);

    calculateAndDisplayEndTime(remainingSeconds);
    this.disabled = true;

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay(remainingSeconds);
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = "終了!";
            endTimeDisplay.textContent = "終了時刻: --:--";
            // スタートボタンは再度有効にせず、プリセット選択を促す
            // this.disabled = false; // コメントアウトまたは削除
            // 必要なら再度プリセット選択を促すUI処理
        }
    }, 1000);
});
// 初期ロード時にスタートボタンを無効化しておく
startTimerButton.disabled = true;


// --- (裏設定) 時刻指定タイマー ---
// コメントアウトを外して使用する場合は、HTML側のコメントアウトも外してください。

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


// --- 票決計算処理 (単純多数決部分を修正) ---
calculateVoteButton.addEventListener('click', function() {
    const aye1 = parseInt(aye1Input.value) || 0;
    const aye2 = parseInt(aye2Input.value) || 0;
    const aye3 = parseInt(aye3Input.value) || 0;
    const nay1 = parseInt(nay1Input.value) || 0;
    const nay2 = parseInt(nay2Input.value) || 0;
    const nay3 = parseInt(nay3Input.value) || 0;
    let proxyVote = parseInt(proxyVoteInput.value) || 0; // 完全多数決の時のみ使用

    let totalAyePersons = 0; // 賛成の総人数
    let totalNayPersons = 0; // 反対の総人数

    let finalAye = 0; // 最終的な賛成票（または人数）
    let finalNay = 0; // 最終的な反対票（または人数）
    let resultText = "";
    let formulaText = "";

    const majorityType = majorityTypeSelect.value;

    if (majorityType === 'absolute') { // 完全多数決 (変更なし)
        const totalAyeWeightedVotes = (aye1 * 1) + (aye2 * 2) + (aye3 * 3);
        const totalNayWeightedVotes = (nay1 * 1) + (nay2 * 2) + (nay3 * 3);

        finalAye = totalAyeWeightedVotes;
        finalNay = totalNayWeightedVotes;

        if (totalAyeWeightedVotes > totalNayWeightedVotes) {
            finalAye += proxyVote;
        } else if (totalNayWeightedVotes > totalAyeWeightedVotes) {
            finalNay += proxyVote;
        } else {
            // 同数の場合の議長委任票の扱いは仕様による
            // ここでは例として加算しない
        }
        formulaText = `賛成(票数): (1票×${aye1} + 2票×${aye2} + 3票×${aye3}) = ${totalAyeWeightedVotes}\n` +
                      `反対(票数): (1票×${nay1} + 2票×${nay2} + 3票×${nay3}) = ${totalNayWeightedVotes}\n`;
        if (proxyVote > 0) {
            formulaText += `議長委任票(${proxyVote})を ${totalAyeWeightedVotes > totalNayWeightedVotes ? '賛成' : (totalNayWeightedVotes > totalAyeWeightedVotes ? '反対' : '影響なし')} に加算\n`;
        }
        formulaText += `最終賛成(票数): ${finalAye}, 最終反対(票数): ${finalNay}`;

    } else { // 単純多数決 (ロジック変更)
        totalAyePersons = aye1 + aye2 + aye3; // 賛成の人数合計
        totalNayPersons = nay1 + nay2 + nay3; // 反対の人数合計

        finalAye = totalAyePersons;
        finalNay = totalNayPersons;
        // 単純多数決では議長委任票は計算に含めない
        proxyVote = 0;

        formulaText = `賛成(人数): ${aye1}(1票) + ${aye2}(2票) + ${aye3}(3票) = ${totalAyePersons} 人\n` +
                      `反対(人数): ${nay1}(1票) + ${nay2}(2票) + ${nay3}(3票) = ${totalNayPersons} 人\n` +
                      `最終賛成(人数): ${finalAye}, 最終反対(人数): ${finalNay}`;
    }

    if (finalAye > finalNay) {
        resultText = "可決 (賛成多数)";
    } else if (finalNay > finalAye) {
        resultText = "否決 (反対多数)";
    } else {
        resultText = "同数 (否決)";
    }

    voteCalculationFormulaDiv.innerText = `計算式:\n${formulaText}`;
    voteResultDiv.textContent = `結果: ${resultText}`;
    saveVoteResultButton.style.display = 'inline-block';

    // 保存用データを作成 (単純多数決時の保存データも更新)
    lastVoteResultData = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        majorityType: majorityType,
        ayeCounts: { count1: aye1, count2: aye2, count3: aye3 },
        nayCounts: { count1: nay1, count2: nay2, count3: nay3 },
        proxyVoteCount: (majorityType === 'absolute' ? (parseInt(proxyVoteInput.value) || 0) : 0), // 単純多数決では0
        totalAyeEffective: (majorityType === 'absolute' ? (aye1 * 1) + (aye2 * 2) + (aye3 * 3) : totalAyePersons), // 有効票/人数
        totalNayEffective: (majorityType === 'absolute' ? (nay1 * 1) + (nay2 * 2) + (nay3 * 3) : totalNayPersons), // 有効票/人数
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
