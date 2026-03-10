import { initWeb3 } from "./web3.js";

let patientAddress = null;
async function connectWallet() {
    try {
        const initResult = await initWeb3();
        if (!initResult) {
            alert("Erreur de connexion à MetaMask.");
            window.location.href = "index.html";
            return;
        }
        const { web3, accounts, contract } = initResult;
        window.web3 = web3;
        window.contract = contract;
        window.accounts = accounts;
        patientAddress = accounts[0];
        const isRegistered = await window.contract.methods
            .isPatientRegistered(patientAddress)
            .call();
        if (!isRegistered) {
            alert(" Votre adresse n'est pas enregistrée.");
            window.location.href = "index.html";
            return;
        }
        await getMyRecord();
    } catch (error) {
        console.error("Erreur:", error);
    }
}
async function getMyRecord() {
    try {
        const patientData = await window.contract.methods
            .getPatientRecord(patientAddress)
            .call({ from: patientAddress });
        const name = patientData.name;
        const currentDataHash = patientData.currentDataHash;
        document.getElementById("welcomeName").innerText = name;
        document.getElementById("patientName").innerText = name;
        document.getElementById("patientAge").innerText = patientData.age;
        document.getElementById("patientSex").innerText = patientData.sex;
        document.getElementById("patientWallet").innerText = patientAddress;
        const hashDiv = document.getElementById("patientDataHash");
        if (hashDiv) {
            hashDiv.innerText = currentDataHash || "N/A";
        }
        if (currentDataHash && currentDataHash.length > 10) {
            await fetchAndDisplayRecordContent(currentDataHash);
        }
    } catch (err) {
        console.error("Erreur lors de la récupération:", err);
    }
}
async function fetchAndDisplayRecordContent(currentDataHash) {
    const contentDiv = document.getElementById("record_content");
    try {
        const localUrl = `http://127.0.0.1:8080/ipfs/${currentDataHash}`;
        let response = await fetch(localUrl);
        if (!response.ok) {
            const backupUrl = `https://ipfs.io/ipfs/${currentDataHash}`;
            response = await fetch(backupUrl);
            if (!response.ok) throw new Error("IPFS unreachable");
        }
        const fileContent = await response.json();
        const diag = fileContent.diagnostic_medical || "Non spécifié";
        const treat = fileContent.traitement || "Non spécifié";
        const reco = fileContent.recommandations || "Aucune";
        contentDiv.innerHTML = `
        <div class="row mt-4">
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0" style="border-top:5px solid #6f42c1">
                    <div class="card-body p-4 text-center">
                        <i class="fas fa-stethoscope fa-3x text-purple opacity-50 mb-3"></i>
                        <h5 class="fw-bold text-purple">Diagnostic Médical</h5>
                        <hr>
                        <p class="text-start bg-light p-3 rounded">${diag}</p>
                    </div>
                </div>
            </div>
            <div class="col-md-6 mb-4">
                <div class="card h-100 shadow-sm border-0" style="border-top:5px solid #198754">
                    <div class="card-body p-4 text-center">
                        <i class="fas fa-pills fa-3x text-success opacity-50 mb-3"></i>
                        <h5 class="fw-bold text-success">Traitement Prescrit</h5>
                        <hr>
                        <p class="text-start bg-light p-3 rounded">${treat}</p>
                    </div>
                </div>
            </div>
            <div class="col-12">
                <div class="card shadow-sm border-0" style="border-left:5px solid #ffc107">
                    <div class="card-body p-3">
                        <h6 class="fw-bold text-warning">
                            <i class="fas fa-lightbulb"></i> Recommandations
                        </h6>
                        <p class="mb-0 text-muted">${reco}</p>
                    </div>
                </div>
            </div>
        </div>`;     
    } catch (err) {
        contentDiv.innerHTML = `
        <div class="alert alert-warning text-center mt-3">
             Erreur IPFS : Vérifiez que IPFS Desktop est ouvert
        </div>`;
    }
}
const downloadBtn = document.getElementById("downloadPdfBtn");
if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {

        const currentHash = document.getElementById("patientDataHash")?.innerText;
        const name = document.getElementById("patientName")?.innerText;

        if (!currentHash || currentHash.includes("N/A")) {
            alert("Aucune preuve disponible.");
            return;
        }
        const recordText = `
PREUVE BLOCKCHAIN - DOSSIER MÉDICAL
---------------------------------
Patient : ${name}
Wallet  : ${patientAddress}
Hash IPFS : ${currentHash}
Date : ${new Date().toLocaleString()}
`;
        const blob = new Blob([recordText], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Preuve_Blockchain_${name}.txt`;
        link.click();
    });
}
window.addEventListener("load", connectWallet);
document.getElementById("logoutBtn").addEventListener("click", () => {
    window.location.href = "index.html";
});
