// script.js の先頭
// TODO: Firebaseプロジェクトからコピーした設定情報を貼り付けてください
const firebaseConfig = {
    apiKey: "AIzaSyCZOsfyAH0xiF7b9jjpXA4C1Zt1DlIMoAU", // セキュリティのため、実際のキーは公開しないでください
    authDomain: "shikkouchairmansystem.firebaseapp.com",
    projectId: "shikkouchairmansystem",
    storageBucket: "shikkouchairmansystem.firebasestorage.app",
    messagingSenderId: "501602223891",
    appId: "1:501602223891:web:6145c706016262d148fce6"
};

// Firebaseを初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); // Firestoreインスタンスを取得

// DOM要素の取得
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const modeSwitcher = document.getElementById('modeSwitcher');
const timerModeDiv = document.getElementById('timerMode');
const votingModeDiv = document.getElementById('votingMode');

const timerPresetsDiv = document.getElementById('timerPresets');
const timerDisplay = document.getElementById('timerDisplay');
const endTimeDisplay = document.getElementById('endTimeDisplay');
const startTimerButton = document.getElementById('startTimerButton');
const resetTimerButton = document.getElementById('resetTimerButton');
const totalPresetClicksDisplay = document.getElementById('totalPresetClicksDisplay');

// 裏設定用 (HTMLに要素がない場合はコメントアウト、またはダミー要素をHTMLに追加)
// const targetTimeInput = document.getElementById('targetTimeInput');
// const startTargetTimeTimerButton = document.getElementById('startTargetTimeTimerButton');
// const targetTimeRemainingDisplay = document.getElementById('targetTimeRemainingDisplay');

const majorityTypeSelect = document.getElementById('majorityType');
const aye1Input = document.getElementById('aye1');
const aye2Input = document.getElementById('aye2');
const aye3Input = document.getElementById('aye3');
const nay1Input = document.getElementById('nay1');
const nay2Input = document.getElementById('nay2');
const nay3Input = document.getElementById('nay3');
const proxyVoteInput = document.getElementById('proxyVote');
const proxyVoteField = document.getElementById('proxyVoteField');
const calculateVoteButton = document.getElementById('calculateVoteButton');
const voteCalculationFormulaDiv = document.getElementById('voteCalculationFormula');
const voteResultDiv = document.getElementById('voteResult');
const saveVoteResultButton = document.getElementById('saveVoteResultButton');

// タイマー関連のグローバル変数
let timerInterval = null;
let remainingSeconds = 0;
let selectedPresetDuration = 0;
let isPresetSelectedAndLocked = false;
let currentPresetDocId = null;
let presetClickCounts = {}; // { presetId1: count1, presetId2: count2, ... }

// 票決関連のグローバル変数
let lastVoteResultData = null;

// --- 初期表示モードの設定 ---
document.addEventListener('DOMContentLoaded', () => {
    const initialMode = modeSwitcher.value;
    if (initialMode === 'timer') {
        timerModeDiv.style.display = 'block';
        votingModeDiv.style.display = 'none';
    } else if (initialMode === 'voting') {
        timerModeDiv.style.display = 'none';
        votingModeDiv.style.display = 'block';
        updateProxyVoteFieldVisibility();
    }
    loadTimerPresets(); // タイマープリセットの読み込み
    startTimerButton.disabled = true; // 初期状態はスタートボタン無効
});

// --- モード切替 ---
modeSwitcher.addEventListener('change', function() {
    if (this.value === 'timer') {
        timerModeDiv.style.display = 'block';
        votingModeDiv.style.display = 'none';
    } else if (this.value === 'voting') {
        timerModeDiv.style.display = 'none';
        votingModeDiv.style.display = 'block';
        updateProxyVoteFieldVisibility();
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
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

// --- タイマー機能 ---

// ヘルパー関数: プリセットボタンの有効/無効を切り替える
function setPresetButtonsState(shouldBeEnabled, clickedButtonId = null, forceDisableAll = false) {
    const presetButtons = timerPresetsDiv.querySelectorAll('.preset-button-wrapper button');
    presetButtons.forEach(button => {
        if (forceDisableAll) { // ★ 追加: 強制的に全ボタン無効化
            button.disabled = true;
            return;
        }
        if (clickedButtonId && button.dataset.id === clickedButtonId && !shouldBeEnabled) {
            // 選択中のボタンで、かつ他を無効化する指示の場合 (つまり選択ロック時)
            button.disabled = false; // 選択中のボタンはキャンセル用に有効のまま
        } else {
            button.disabled = !shouldBeEnabled;
        }
    });
}

// プリセット選択/キャンセル処理
async function handlePresetSelection(buttonElement) {
    const presetId = buttonElement.dataset.id;
    const durationSeconds = parseInt(buttonElement.dataset.seconds);

    if (isPresetSelectedAndLocked) {
        if (presetId === currentPresetDocId) { // 同じボタンが再度押された (キャンセル処理)
            console.log("Cancelling preset:", presetId);
            try {
                // (キャンセル処理のFirestore更新とUI更新は変更なし)
                const presetRef = db.collection('timerPresets').doc(currentPresetDocId);
                await presetRef.update({
                    clickCount: firebase.firestore.FieldValue.increment(-1)
                });
                presetClickCounts[currentPresetDocId]--;
                document.getElementById(`count-${currentPresetDocId}`).textContent = `${presetClickCounts[currentPresetDocId]}回`;
                updateTotalClicksDisplay();

                clearInterval(timerInterval);
                timerInterval = null;
                remainingSeconds = 0;
                updateTimerDisplay(remainingSeconds);
                endTimeDisplay.textContent = "終了時刻: --:--";

                isPresetSelectedAndLocked = false;
                currentPresetDocId = null;
                selectedPresetDuration = 0;
                setPresetButtonsState(true); // 全ボタン有効化
                startTimerButton.disabled = true;
                console.log("Preset cancelled. All buttons enabled.");
            } catch (error) {
                console.error("Error cancelling preset count:", error);
                alert("プリセットのキャンセル処理に失敗しました。");
            }
        } else {
            console.warn("Another preset is already selected. Click the selected one to cancel or reset.");
        }
    } else { // 新規にプリセット選択
        console.log("Selecting preset:", presetId);
        // (新規選択時の処理は基本的に変更なし)
        currentPresetDocId = presetId;
        selectedPresetDuration = durationSeconds;
        isPresetSelectedAndLocked = true;

        try {
            const presetRef = db.collection('timerPresets').doc(currentPresetDocId);
            await presetRef.update({
                clickCount: firebase.firestore.FieldValue.increment(1)
            });
            presetClickCounts[currentPresetDocId]++;
            document.getElementById(`count-${currentPresetDocId}`).textContent = `${presetClickCounts[currentPresetDocId]}回`;
            updateTotalClicksDisplay();

            remainingSeconds = selectedPresetDuration;
            updateTimerDisplay(remainingSeconds);
            calculateAndDisplayEndTime(remainingSeconds);
            if (timerInterval) clearInterval(timerInterval);

            setPresetButtonsState(false, currentPresetDocId); // 他を無効化、選択中のものは有効
            startTimerButton.disabled = false;
            console.log("Preset selected. Other buttons disabled.");
        } catch (error) {
            console.error("Error selecting preset:", error);
            alert("プリセットの選択処理に失敗しました。");
            isPresetSelectedAndLocked = false;
            currentPresetDocId = null;
            selectedPresetDuration = 0;
            setPresetButtonsState(true); // エラー時は全ボタン有効に戻す
            startTimerButton.disabled = true;
        }
    }
}

async function loadTimerPresets() {
    try {
        const snapshot = await db.collection('timerPresets').orderBy('durationSeconds').get();
        timerPresetsDiv.innerHTML = '';
        let totalClicks = 0;
        presetClickCounts = {};

        snapshot.forEach(doc => {
            const preset = doc.data();
            const presetId = doc.id;
            const currentCount = preset.clickCount || 0;
            presetClickCounts[presetId] = currentCount;
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

            button.addEventListener('click', function() {
                handlePresetSelection(this);
            });

            wrapper.appendChild(button);
            wrapper.appendChild(countDisplay);
            timerPresetsDiv.appendChild(wrapper);
        });
        updateTotalClicksDisplay();
        setPresetButtonsState(true); // 初期ロード時は全ボタン有効
        // startTimerButton.disabled = true; は DOMContentLoaded 内で設定
    } catch (error) {
        console.error("Error loading timer presets: ", error);
        timerPresetsDiv.textContent = "プリセットの読み込みに失敗しました。";
        totalPresetClicksDisplay.textContent = "合計回数: エラー";
    }
}


function updateTotalClicksDisplay() {
    let sum = 0;
    for (const id in presetClickCounts) {
        sum += presetClickCounts[id];
    }
    totalPresetClicksDisplay.textContent = `合計回数: ${sum}回`;
}

function updateTimerDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

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
startTimerButton.addEventListener('click', function() {
    if (!isPresetSelectedAndLocked || remainingSeconds <= 0) {
        alert("タイマー時間を選択してください。");
        return;
    }
    if (timerInterval) clearInterval(timerInterval);

    console.log("Timer started. Count for preset", currentPresetDocId, "is now fixed for this session.");
    this.disabled = true; // スタートボタンを無効化

    // ★ スタートしたら、選択中のものも含め、全てのプリセットボタンを無効化
    setPresetButtonsState(false, null, true); // 第3引数 true で強制的に全無効

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay(remainingSeconds);
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = "終了!";
            endTimeDisplay.textContent = "終了時刻: --:--";

            // ★ タイマー終了後、全てのプリセットボタンを再度有効化
            setPresetButtonsState(true);
            isPresetSelectedAndLocked = false; // ロック状態を解除 (重要)
            currentPresetDocId = null;      // 選択中IDもリセット
            selectedPresetDuration = 0;     // 選択中時間もリセット
            // スタートボタンは無効のまま (再度プリセット選択から)
            console.log("Timer finished. All preset buttons re-enabled.");
        }
    }, 1000);
});

// --- タイマーリセット処理 (修正) ---
resetTimerButton.addEventListener('click', async function() {
    clearInterval(timerInterval);
    timerInterval = null;
    remainingSeconds = 0;
    updateTimerDisplay(remainingSeconds);
    endTimeDisplay.textContent = "終了時刻: --:--";

    isPresetSelectedAndLocked = false;
    currentPresetDocId = null;
    selectedPresetDuration = 0;
    setPresetButtonsState(true); // 全ボタン有効化
    startTimerButton.disabled = true;

    // 全てのプリセットのクリック回数を0にリセット (既存のロジックは維持)
    try {
        const presetsQuerySnapshot = await db.collection('timerPresets').get();
        const batch = db.batch();
        presetsQuerySnapshot.forEach(doc => {
            const presetRef = db.collection('timerPresets').doc(doc.id);
            batch.update(presetRef, { clickCount: 0 });
            presetClickCounts[doc.id] = 0;
            const countDisplayElement = document.getElementById(`count-${doc.id}`);
            if (countDisplayElement) {
                countDisplayElement.textContent = `0回`;
            }
        });
        await batch.commit();
        console.log("All preset counts have been reset to 0 by reset button.");
        updateTotalClicksDisplay();
    } catch (error) {
        console.error("Error resetting all preset counts by reset button: ", error);
        // (フォールバック処理は変更なし)
        for (const presetId in presetClickCounts) {
            presetClickCounts[presetId] = 0;
            const countDisplayElement = document.getElementById(`count-${presetId}`);
            if (countDisplayElement) {
                countDisplayElement.textContent = `0回`;
            }
        }
        updateTotalClicksDisplay();
        alert("一部またはすべてのプリセット回数のリセットに失敗しました。画面表示はリセットされます。");
    }
});

// --- (裏設定) 時刻指定タイマー (関連するDOM要素がない場合はコメントアウト) ---

if (startTargetTimeTimerButton) { // 要素が存在する場合のみリスナーを設定
    startTargetTimeTimerButton.addEventListener('click', function() {
        const targetTimeValue = targetTimeInput.value;
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
        selectedPresetDuration = 0;
        updateTimerDisplay(remainingSeconds);
        endTimeDisplay.textContent = `終了時刻: ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
        if (timerInterval) clearInterval(timerInterval);
        startTimerButton.disabled = true;

        timerInterval = setInterval(() => {
            remainingSeconds--;
            updateTimerDisplay(remainingSeconds);
            if (targetTimeRemainingDisplay) {
                targetTimeRemainingDisplay.textContent = `目標時刻まであと ${formatTime(remainingSeconds)}`;
            }
            if (remainingSeconds <= 0) {
                clearInterval(timerInterval);
                timerDisplay.textContent = "目標時刻です!";
                if (targetTimeRemainingDisplay) {
                    targetTimeRemainingDisplay.textContent = "";
                }
                startTimerButton.disabled = false;
            }
        }, 1000);
    });
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// --- 票決モード機能 ---
function updateProxyVoteFieldVisibility() {
    if (majorityTypeSelect.value === 'simple') {
        proxyVoteField.style.display = 'none';
    } else {
        proxyVoteField.style.display = 'block';
    }
    voteCalculationFormulaDiv.textContent = "計算式: ";
    voteResultDiv.textContent = "結果: ";
    saveVoteResultButton.style.display = 'none';
    lastVoteResultData = null;
}
majorityTypeSelect.addEventListener('change', updateProxyVoteFieldVisibility);
// 初期表示のために呼び出し (DOMContentLoaded内で呼ばれるように移動しても良い)
// ただし、DOMContentLoaded より前に majorityTypeSelect が存在しない可能性があるので注意
if (majorityTypeSelect) { // 要素が存在するか確認してから呼び出し
    updateProxyVoteFieldVisibility();
}


calculateVoteButton.addEventListener('click', function() {
    const aye1 = parseInt(aye1Input.value) || 0;
    const aye2 = parseInt(aye2Input.value) || 0;
    const aye3 = parseInt(aye3Input.value) || 0;
    const nay1 = parseInt(nay1Input.value) || 0;
    const nay2 = parseInt(nay2Input.value) || 0;
    const nay3 = parseInt(nay3Input.value) || 0;
    let proxyVoteValue = parseInt(proxyVoteInput.value) || 0;

    let totalAyePersons = 0;
    let totalNayPersons = 0;
    let finalAye = 0;
    let finalNay = 0;
    let resultText = "";
    let formulaText = "";
    const majorityType = majorityTypeSelect.value;

    if (majorityType === 'absolute') {
        const totalAyeWeightedVotes = (aye1 * 1) + (aye2 * 2) + (aye3 * 3);
        const totalNayWeightedVotes = (nay1 * 1) + (nay2 * 2) + (nay3 * 3);
        finalAye = totalAyeWeightedVotes;
        finalNay = totalNayWeightedVotes;

        if (totalAyeWeightedVotes > totalNayWeightedVotes) {
            finalAye += proxyVoteValue;
        } else if (totalNayWeightedVotes > totalAyeWeightedVotes) {
            finalNay += proxyVoteValue;
        }
        formulaText = `賛成(票数): (1票×${aye1} + 2票×${aye2} + 3票×${aye3}) = ${totalAyeWeightedVotes}\n` +
                      `反対(票数): (1票×${nay1} + 2票×${nay2} + 3票×${nay3}) = ${totalNayWeightedVotes}\n`;
        if (proxyVoteValue > 0) {
            formulaText += `議長委任票(${proxyVoteValue})を ${totalAyeWeightedVotes > totalNayWeightedVotes ? '賛成' : (totalNayWeightedVotes > totalAyeWeightedVotes ? '反対' : '影響なし')} に加算\n`;
        }
        formulaText += `最終賛成(票数): ${finalAye}, 最終反対(票数): ${finalNay}`;
    } else { // simple
        totalAyePersons = aye1 + aye2 + aye3;
        totalNayPersons = nay1 + nay2 + nay3;
        finalAye = totalAyePersons;
        finalNay = totalNayPersons;
        proxyVoteValue = 0; // 単純多数決では計算に含めないことを明示

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

    lastVoteResultData = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        majorityType: majorityType,
        ayeCounts: { count1: aye1, count2: aye2, count3: aye3 },
        nayCounts: { count1: nay1, count2: nay2, count3: nay3 },
        proxyVoteCount: (majorityType === 'absolute' ? (parseInt(proxyVoteInput.value) || 0) : 0),
        totalAyeEffective: (majorityType === 'absolute' ? (aye1 * 1) + (aye2 * 2) + (aye3 * 3) : totalAyePersons),
        totalNayEffective: (majorityType === 'absolute' ? (nay1 * 1) + (nay2 * 2) + (nay3 * 3) : totalNayPersons),
        finalAye: finalAye,
        finalNay: finalNay,
        result: resultText,
        formula: formulaText
    };
});

saveVoteResultButton.addEventListener('click', async function() {
    if (!lastVoteResultData) {
        alert("保存する計算結果がありません。");
        return;
    }
    try {
        const docRef = await db.collection('votingResults').add(lastVoteResultData);
        console.log("Document written with ID: ", docRef.id);
        alert("票決結果を保存しました！");
        saveVoteResultButton.style.display = 'none';
        lastVoteResultData = null;
    } catch (error) {
        console.error("Error adding document: ", error);
        alert("結果の保存に失敗しました。");
    }
});
