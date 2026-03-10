import { initWeb3 } from "./web3.js";
let doctorAddress = null;
let selectedPatientWallet = null;
let selectedPatientName = null;
function showLoader(isFullPage = false) {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'block';
        if (isFullPage) {
            loader.classList.add('full-screen');
        } else {
            loader.classList.remove('full-screen');
        }
    }
}
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
    }
}
function logout() {
    window.location.href = "index.html";
}
async function loadAllStats() {
    if (typeof loadRiskDistributionStats === 'function') {
        await loadRiskDistributionStats();
    }
    if (typeof loadRiskByAgeAndSexStats === 'function') {
        await loadRiskByAgeAndSexStats();
    }
}
function showSection(sectionId, element) {
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    }
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }
    if (sectionId === 'dashboard-section') {
        loadAllStats(); 
    } else if (sectionId === 'list-patients-section') {
        loadMyPatients();
    }
}
function drawRiskDistributionChart(critical, low, total, totalAnalyzed) {
    const ctx = document.getElementById('riskDistributionChart').getContext('2d');
    const unanalyzed = total - (critical + low);
    const criticalPercent = totalAnalyzed > 0 ? ((critical / totalAnalyzed) * 100).toFixed(1) : 0;
    const lowPercent = totalAnalyzed > 0 ? ((low / totalAnalyzed) * 100).toFixed(1) : 0;
    const unanalyzedPercent = total > 0 ? ((unanalyzed / total) * 100).toFixed(1) : 0;
    if (window.riskChart) {
        window.riskChart.destroy();
    }
    window.riskChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [
                `Risque Critique (${criticalPercent}%)`,
                `Risque Faible (${lowPercent}%)`,
                `Non Analysé (${unanalyzedPercent}%)`
            ],
            datasets: [{
                data: [critical, low, unanalyzed],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.8)',
                    'rgba(75, 192, 192, 0.8)',
                    'rgba(200, 200, 200, 0.8)'
                ],
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: `Total Patients: ${total}`
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            const rawValue = context.parsed;
                            const percentage = (rawValue / total) * 100;
                            return `${label} ${rawValue} Patients (${percentage.toFixed(1)}%)`;
                        }
                    }
                }
            }
        }
    });
}
async function loadJsonFromIpfs(ipfsHash) {
    if (!ipfsHash || ipfsHash.length < 5) {
        return null;
    }
    try {
        const chunks = [];
        for await (const chunk of ipfs.cat(ipfsHash)) {
            chunks.push(chunk);
        }
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            mergedArray.set(chunk, offset);
            offset += chunk.length;
        }
        const jsonString = new TextDecoder().decode(mergedArray);
        return JSON.parse(jsonString);
    } catch (err) {
        console.error(`Erreur IPFS lors de la récupération du Hash ${ipfsHash}:`, err);
        return null;
    }
}
async function getPatientsForStats() {
    if (!window.contract || !doctorAddress) return [];
    const patientAddresses = await window.contract.methods
        .getMyPatientsAddresses()
        .call({ from: doctorAddress });
    if (patientAddresses.length === 0) return [];
    const patientPromises = patientAddresses.map(wallet => 
        window.contract.methods.getPatient(wallet).call({ from: doctorAddress })
    );
    const patientsInfo = await Promise.all(patientPromises);
    return patientsInfo.filter(p => p.isExist);
}
async function loadRiskDistributionStats() {
    console.log("Démarrage du chargement des statistiques de risque (Vos Patients)...");
    showLoader();
    let criticalCount = 0;
    let lowRiskCount = 0;
    let totalPatients = 0;
    try {
        const patients = await getPatientsForStats(); 
        totalPatients = patients.length;
        const recordPromises = patients.map(patient => 
             window.contract.methods.getPatientRecord(patient.wallet).call({ from: window.currentAccount })
        );
        const records = await Promise.all(recordPromises);
        const analysisPromises = records.map(async (recordData) => {
            const ipfsHash = recordData[3];
            if (ipfsHash && ipfsHash !== "") {
                const dossier = await loadJsonFromIpfs(ipfsHash);
                if (dossier && dossier.diagnostic_ia) {
                    const diag = dossier.diagnostic_ia.toUpperCase();
                    if (diag.includes("NON-CRITIQUE")) {
                        return 'low';
                    } else if (diag.includes("CRITIQUE")) {
                        return 'critical';
                    }
                }
            }
            return 'unanalyzed';
        });
        const analysisResults = await Promise.all(analysisPromises);
        let totalAnalyzed = 0;
        analysisResults.forEach(result => {
            if (result === 'critical') {
                criticalCount++;
                totalAnalyzed++;
            } else if (result === 'low') {
                lowRiskCount++;
                totalAnalyzed++;
            }
        });
        console.log(`Stats calculées (Vos Patients): Critique=${criticalCount}, Faible=${lowRiskCount}, Total=${totalPatients}`);
        drawRiskDistributionChart(criticalCount, lowRiskCount, totalPatients, totalAnalyzed);
    } catch (error) {
        console.error("Erreur lors de la construction des statistiques:", error);
    } finally {
        hideLoader();
    }
}
function getAgeBin(age) {
    if (age < 40) {
        return '<40';
    } else if (age >= 40 && age <= 59) {
        return '40-59';
    } else {
        return '60+';
    }
}
function drawRiskByAgeAndSexChart(stats) {
    const ctx = document.getElementById('riskByAgeSexChart').getContext('2d');
    const chartLabels = [
        'H <40', 'F <40',
        'H 40-59', 'F 40-59',
        'H 60+', 'F 60+'
    ];
    if (window.riskByAgeSexChart && typeof window.riskByAgeSexChart.destroy === 'function') {
        window.riskByAgeSexChart.destroy();
    }
    const criticalData = [
        stats['<40'].homme.critical, stats['<40'].femme.critical,
        stats['40-59'].homme.critical, stats['40-59'].femme.critical,
        stats['60+'].homme.critical, stats['60+'].femme.critical
    ];
    const lowData = [
        stats['<40'].homme.low, stats['<40'].femme.low,
        stats['40-59'].homme.low, stats['40-59'].femme.low,
        stats['60+'].homme.low, stats['60+'].femme.low
    ];
    const unanalyzedData = [
        stats['<40'].homme.unanalyzed, stats['<40'].femme.unanalyzed,
        stats['40-59'].homme.unanalyzed, stats['40-59'].femme.unanalyzed,
        stats['60+'].homme.unanalyzed, stats['60+'].femme.unanalyzed
    ];

    window.riskByAgeSexChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Risque Critique',
                    data: criticalData,
                    backgroundColor: 'rgba(255, 99, 132, 0.8)',
                },
                {
                    label: 'Risque Faible',
                    data: lowData,
                    backgroundColor: 'rgba(75, 192, 192, 0.8)',
                },
                {
                    label: 'Non Analysé',
                    data: unanalyzedData,
                    backgroundColor: 'rgba(200, 200, 200, 0.8)',
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true, title: { display: true, text: 'Genre et Catégorie d\'Âge (H=Homme, F=Femme)' } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Nombre de Patients' } }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Distribution des Risques par Genre et Âge'
                }
            }
        }
    });
}
async function loadRiskByAgeAndSexStats() {
    console.log("Démarrage du chargement des statistiques par Genre et Âge (Vos Patients)...");
    const stats = {
        '<40': { homme: { critical: 0, low: 0, unanalyzed: 0 }, femme: { critical: 0, low: 0, unanalyzed: 0 } },
        '40-59': { homme: { critical: 0, low: 0, unanalyzed: 0 }, femme: { critical: 0, low: 0, unanalyzed: 0 } },
        '60+': { homme: { critical: 0, low: 0, unanalyzed: 0 }, femme: { critical: 0, low: 0, unanalyzed: 0 } }
    };
    try {
        const patients = await getPatientsForStats();
        const analysisPromises = patients.map(async (patient) => {
            const age = parseInt(patient.age);
            if (isNaN(age)) return; 
            const sexKey = patient.sex === 'Homme' ? 'homme' : 'femme';
            const ageBinKey = getAgeBin(age);
            const recordData = await window.contract.methods
                .getPatientRecord(patient.wallet)
                .call({ from: window.currentAccount });
            const ipfsHash = recordData[3];
            let category = 'unanalyzed';
            if (ipfsHash && ipfsHash !== "") {
                const dossier = await loadJsonFromIpfs(ipfsHash);
                if (dossier && dossier.diagnostic_ia) {
                    const diagnosticText = dossier.diagnostic_ia.toLowerCase();

                    if (diagnosticText.includes("non-critique")) {
                        category = 'low';
                    } else if (diagnosticText.includes("critique")) {
                        category = 'critical';
                    }
                }
            }
            stats[ageBinKey][sexKey][category]++;
        });
        await Promise.all(analysisPromises);
        console.log("Fin Stats Genre/Âge (Vos Patients). Données collectées :", stats);
        drawRiskByAgeAndSexChart(stats);
    } catch (error) {
        console.error("Erreur lors de la construction des statistiques par genre et âge:", error);
    }
}
const ipfs = window.IpfsHttpClient.create({ host: '127.0.0.1', port: 5001, protocol: 'http' });
async function loadDoctorProfile() {
    const doctorAddress = window.currentAccount;
    const docProfileNameElement = document.getElementById('docProfileName');
    const statusElement = document.getElementById('docProfileStatus');
    if (!docProfileNameElement || !statusElement) return; 
    docProfileNameElement.textContent = "Chargement...";
    statusElement.textContent = "Chargement...";
    statusElement.className = "badge bg-secondary";
    if (!doctorAddress || !window.contract) {
        console.warn("Adresse Docteur ou contrat non défini.");
        return;
    }
    showLoader();
    try {
        const isRegistered = await window.contract.methods.isDoctorRegistered(doctorAddress).call();
        if (!isRegistered) {
            docProfileNameElement.textContent = "Docteur non enregistré";
            document.getElementById('docProfileWallet').textContent = doctorAddress;
            statusElement.textContent = "Non enregistré";
            statusElement.className = "badge bg-danger";
            return;
        }
        const docData = await window.contract.methods
            .getDoctor(doctorAddress)
            .call({ from: doctorAddress });
        const isAuthorized = await window.contract.methods
            .authorizedDoctors(doctorAddress)
            .call();
        const wasAuthorized = await window.contract.methods
            .wasAuthorized(doctorAddress)
            .call();
        document.getElementById('docProfileId').textContent = docData.id;
        docProfileNameElement.textContent = docData.name;
        document.getElementById('docProfileSpecialty').textContent = docData.specialty;
        document.getElementById('docProfileWallet').textContent = docData.wallet;
        if (isAuthorized) {
            statusElement.textContent = "Autorisé (Écriture)";
            statusElement.className = "badge bg-success";
        } else if (wasAuthorized) {
            statusElement.textContent = "Révoqué (Accès Refusé)";
            statusElement.className = "badge bg-danger";
        } else {
            statusElement.textContent = "Enregistré, Non Autorisé";
            statusElement.className = "badge bg-warning text-dark";
        }
        document.getElementById('doctorAddress').textContent =
            `${doctorAddress.substring(0, 6)}...${doctorAddress.slice(-4)}`;
    } catch (error) {
        console.error("Erreur chargement profil:", error);
        docProfileNameElement.textContent = "Erreur de connexion";
        statusElement.textContent = "Erreur";
        statusElement.className = "badge bg-danger";
        alert("Erreur lors du chargement du fichier doctor. Vérifiez MetaMask et votre connexion réseau.");
    } finally {
        hideLoader();
    }
}
async function connectWallet() {
    showLoader(true); 
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
        window.currentAccount = accounts[0];
        doctorAddress = accounts[0];
        await loadDoctorProfile();
        const isRegistered = await window.contract.methods.isDoctorRegistered(doctorAddress).call();
        if (isRegistered) {
             console.log("Doctor connecté et profil chargé:", doctorAddress);
             await loadAllStats();
        } else {
            console.log("Doctor connecté:", doctorAddress, " - Accès limité (Non enregistré).");
        }
    } catch (err) {
        console.error("Erreur de connexion:", err);
        alert("Erreur lors de la connexion. (Check MetaMask & Console).");
        window.location.href = "index.html";
    } finally {
        hideLoader();
    }
}
function resetPatientForm() {
    document.getElementById("patientName").value = "";
    document.getElementById("patientAge").value = "";
    document.getElementById("patientSex").value = "Homme";
    document.getElementById("patientAddress").value = "";
}
function resetAIForm() {
    document.getElementById("aiAnalysisForm").reset();
    document.getElementById("input_patient_wallet").value = "";
    document.getElementById('input_age').value = '';
    document.getElementById('input_sex').value = '';
}
async function addPatient(event) {
    event.preventDefault();
    const name = document.getElementById("patientName").value;
    const age = document.getElementById("patientAge").value;
    const sex = document.getElementById("patientSex").value;
    const wallet = document.getElementById("patientAddress").value;
    showLoader();
    try {
        await window.contract.methods
            .addPatient(name, age, sex, wallet)
            .send({ from: doctorAddress });
        alert("Patient ajouté avec succès !");
        resetPatientForm();
        await loadMyPatients(); 
    } catch (err) {
        console.error(err);
        alert(" Erreur lors de l'ajout du patient. Doctor n'est pas autorise.");
    } finally {
        hideLoader();
    }
}
async function loadMyPatients() {
 const tableBody = document.getElementById("patientsTableBody");
tableBody.innerHTML ='<tr><td colspan="6" class="text-center text-muted">Chargement de vos patients...</td></tr>';
 
 if (!window.contract || !doctorAddress) {
 tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erreur: Connexion perdue.</td></tr>';
 return;
 }
 try {
 const patientAddresses = await window.contract.methods
 .getMyPatientsAddresses()
 .call({ from: doctorAddress });
 tableBody.innerHTML = "";
 let index = 1;
 const promises = [];
 for (const wallet of patientAddresses) {
 promises.push(
 window.contract.methods.getPatient(wallet).call({ from: doctorAddress })
 );
 }
 const patientsData = await Promise.all(promises);
 for (const patient of patientsData) {
 if (patient.isExist && patient.wallet !== '0x0000000000000000000000000000000000000000') {
 const actionsHtml = `
 <button class="btn btn-info btn-sm" onclick="openTraitementModal('${patient.wallet}', '${patient.name}')">Traitement</button>
 <button class="btn btn-primary btn-sm" onclick="redirectToAIAnalysis('${patient.wallet}')">Analyse IA</button>
 <button class="btn btn-warning btn-sm" onclick="viewPatientRecord('${patient.wallet}')">Voir Hash</button>
 <button class="btn btn-danger btn-sm" onclick="deletePatient('${patient.wallet}')">Supprimer</button>
 `;
 const row = tableBody.insertRow();
 row.innerHTML = `
 <td>${index++}</td>
 <td>${patient.name}</td>
 <td>${patient.age}</td>
 <td>${patient.sex}</td>
 <td>${patient.wallet.substring(0, 10)}...${patient.wallet.slice(-4)}</td>
 <td>${actionsHtml}</td>
 `;
 }
 }
 if (index === 1) {
 tableBody.innerHTML =
 '<tr><td colspan="6" class="text-center text-secondary">Aucun patient trouvé enregistré par vous.</td></tr>';
   }
 } catch (err) {
 console.error("Erreur lors du chargement de vos patients:", err);
 tableBody.innerHTML =
 '<tr><td colspan="6" class="text-center text-danger">Erreur lors du chargement des patients.</td></tr>';
}
}
async function viewPatientRecord(wallet) {
    try {
        const patientData = await window.contract.methods
            .getPatientRecord(wallet)
            .call({ from: doctorAddress });
        const name = patientData[0];
        const age = patientData[1];
        const sex = patientData[2];
        const currentDataHash = patientData[3];
        const lastUpdated = patientData[4];

        if (!currentDataHash || currentDataHash === "") {
            alert(`
                 Aucun Hash trouvé pour ce patient.
                Effectuez d'abord une analyse IA pour générer un Hash.
            `);
            return;
        }
        const localIpfsLink = `http://127.0.0.1:8080/ipfs/${currentDataHash}`;
        const publicIpfsLink = `https://ipfs.io/ipfs/${currentDataHash}`;
        const displayMessage = `
            Dossier Patient: ${name}
            -------------------------------------
            Age: ${age} - Sexe: ${sex}
            Dernière mise à jour: ${new Date(parseInt(lastUpdated) * 1000).toLocaleString()}
            -------------------------------------
             Hash (CID) du Dossier Médical:
            ${currentDataHash}

             Lien IPFS (Local – recommandé):
            ${localIpfsLink}

             Lien IPFS (Public – peut donner erreur 504):
            ${publicIpfsLink}
        `;
        window.prompt(displayMessage, localIpfsLink);
    } catch (err) {
        console.error("Erreur lors de la récupération :", err);
        alert(" Erreur lors de la récupération du dossier patient. Vérifiez les permissions.");
    }
}
async function sendDataForAIPrediction(event) {
    event.preventDefault();
    const patientWallet = document.getElementById("input_patient_wallet").value.trim();
    if (!patientWallet || patientWallet.length < 40) {
        alert("Veuillez saisir une adresse de patient valide.");
        return;
    }
    const patientData = {
        age: parseFloat(document.getElementById("input_age").value),
        sex: parseFloat(document.getElementById("input_sex").value),
        cp: parseFloat(document.getElementById("input_cp").value),
        trestbps: parseFloat(document.getElementById("input_trestbps").value),
        chol: parseFloat(document.getElementById("input_chol").value),
        fbs: parseFloat(document.getElementById("input_fbs").value),
        restecg: parseFloat(document.getElementById("input_restecg").value),
        thalach: parseFloat(document.getElementById("input_thalach").value),
        exang: parseFloat(document.getElementById("input_exang").value),
        oldpeak: parseFloat(document.getElementById("input_oldpeak").value),
        slope: parseFloat(document.getElementById("input_slope").value),
        ca: parseFloat(document.getElementById("input_ca").value),
        thal: parseFloat(document.getElementById("input_thal").value)
    };
    let risk = null;
    let diagnosticMessage = "";
    showLoader();
    try {
        const response = await fetch('http://127.0.0.1:5000/predict_risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patientData)
        });
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status} - Vérifiez l'URL et le statut du serveur Flask.`);
        }
        const result = await response.json();
        risk = result.risk_prediction;
        if (risk === 1) {
            diagnosticMessage = `DIAGNOSTIC CRITIQUE: Risque Cardiaque Élevé (IA).`;
            alert(` ALERTE IA : Risque Critique détecté. Le Hash sera mis à jour.`);
        } else {
            diagnosticMessage = `DIAGNOSTIC NON-CRITIQUE: Faible risque Cardiaque (IA).`;
            alert(` IA : Risque Faible détecté. Le Hash sera mis à jour.`);
        }
    } catch (error) {
        hideLoader();
        console.error("Erreur de communication avec le serveur IA:", error);
        alert(" Échec de la communication avec le serveur IA (Port 5000). Assurez-vous que 'app.py' est en cours d'exécution.");
        return;
    }
    try {
        const fileContent = JSON.stringify({
            date: new Date().toISOString(),
            patientWallet: patientWallet,
            data_clinique: patientData,
            diagnostic_ia: diagnosticMessage
        });
        const result = await ipfs.add(fileContent, { pin: true });
        const ipfsHash = result.path;
        await updatePatientRecordHash(patientWallet, ipfsHash);
        alert(`✅ Hash IPFS du dossier mis à jour avec succès! CID: ${ipfsHash}`);
        resetAIForm();
        loadAllStats(); 
    } catch (ipfsError) {
        console.error("Erreur de connexion/upload IPFS:", ipfsError);
        alert(" Échec de la connexion ou du chargement sur IPFS. Assurez-vous que 'IPFS Desktop' est ouvert et connecté.");
    } finally {
        hideLoader();
    }
}
async function updatePatientRecordHash(wallet, newHash) {
    if (!newHash || newHash.length < 5) {
        alert("Le Hash généré est invalide. Opération annulée.");
        return;
    }
    console.log("CID IPFS reçu pour mise à jour:", newHash);
    try {
        await window.contract.methods
            .updatePatientDataHash(wallet, newHash)
            .send({
                from: doctorAddress,
                gas: 3000000
            })
            .on('receipt', function(receipt){
                console.log("Transaction de mise à jour réussie. Hash:", receipt.transactionHash);
            })
            .on('error', function(error){
                console.error("Erreur de transaction/revert détectée:", error);
                alert(" Erreur lors de la récupération du hachage sur la blockchain (Vérifiez le journal de la console pour connaître la raison du rejet).");
            });
    } catch (err) {
        console.error("Erreur générale lors de l'envoi de la transaction:", err);
        alert(" Erreur lors de la mise à jour du Hash sur la Blockchain (Vérifiez Console Log).");
    }
}
function openModifyPatientAgeModal(wallet, name, currentAge) {
    const modalContent = `
        <h5>Modifier Patient: ${name}</h5>
        <p>Wallet: ${wallet}</p>
        <div class="mb-3">
            <label for="newPatientAge" class="form-label">Nouvel Âge</label>
            <input type="number" class="form-control" id="newPatientAge" value="${currentAge}" min="1" max="150">
        </div>
        <button class="btn btn-primary" onclick="modifyPatientAge('${wallet}')">Enregistrer les changements</button>
    `;
    document.getElementById('genericModalBody').innerHTML = modalContent;
    $('#genericModal').modal('show');
}
function redirectToAIAnalysis(patientWallet) {
    localStorage.setItem('patientWalletForAI', patientWallet);
    const analyseTab = document.querySelector('a[data-section="ia-analysis-section"]');
    if (analyseTab) {
        analyseTab.click();
        const inputWallet = document.getElementById('input_patient_wallet');
        if (inputWallet) {
            inputWallet.value = patientWallet;
            if (window.loadPatientDataForAnalysis) {
                window.loadPatientDataForAnalysis(patientWallet);
            }
        }
    } else {
        console.error("Aucun lien Analyse IA trouvé pour modifier la section.");
        document.getElementById('list-patients-section').classList.remove('active-section');
        document.getElementById('ia-analysis-section').classList.add('active-section');
    }
    console.log(`Redirection vers la section d'analyse du patient : ${patientWallet}`);
}

async function saveTraitement() {
    if (!selectedPatientWallet) {
        alert("Aucun patient sélectionné.");
        return;
    }
    const diagnosticMed = document.getElementById("docDiagnostic").value.trim();
    const traitement = document.getElementById("docTraitement").value.trim();
    const reco = document.getElementById("docReco").value.trim();
    if (!diagnosticMed || !traitement) {
        alert("Diagnostic et traitement obligatoires.");
        return;
    }
    showLoader();
    try {
        const record = await window.contract.methods
            .getPatientRecord(selectedPatientWallet)
            .call({ from: doctorAddress });
        const oldHash = record[3];
        let diagnosticIA = "Non disponible";
        if (oldHash && oldHash !== "") {
            const oldDossier = await loadJsonFromIpfs(oldHash);
            if (oldDossier && oldDossier.diagnostic_ia) {
                diagnosticIA = oldDossier.diagnostic_ia;
            }
        }
        const mergedDossier = {
            date: new Date().toISOString(),
            patientWallet: selectedPatientWallet,
            diagnostic_ia: diagnosticIA,
            diagnostic_medical: diagnosticMed,
            traitement: traitement,
            recommandations: reco
        };
        const result = await ipfs.add(
            JSON.stringify(mergedDossier),
            { pin: true }
        );
        const newHash = result.path;
        await updatePatientRecordHash(selectedPatientWallet, newHash);
        alert("Traitement enregistré et dossier mis à jour !");
        $('#traitementModal').modal('hide');
        console.log("Nouveau dossier IPFS:", mergedDossier);
    } catch (err) {
        console.error("Erreur STEP 3:", err);
        alert("Erreur lors de l'enregistrement du traitement.");
    } finally {
        hideLoader();
    }
}
async function deletePatient(wallet) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce patient ?")) return;
    showLoader();
    try {
        await window.contract.methods.deletePatient(wallet).send({ from: doctorAddress });
        alert("Patient supprimé !");
        loadMyPatients();
        loadAllStats();
    } catch (err) {
        console.error(err);
        alert("Erreur lors de la suppression.");
    } finally {
        hideLoader();
    }
}
async function modifyPatientAge(patientWallet) {
    const newAge = document.getElementById('newPatientAge').value;
    if (newAge < 1 || newAge > 150) {
        alert("L'âge doit être entre 1 et 150.");
        return;
    }
    $('#genericModal').modal('hide');
    try {
        await contract.methods.updatePatientAge(
            patientWallet,
            newAge
        ).send({ from: currentAccount });
        alert(`L'âge du patient a été correctement saisi dans ${newAge}.`);
        await loadMyPatients();
        loadAllStats(); 
    } catch (error) {
        console.error("Erreur lors de la mise à jour de l'âge du patient:", error);
        alerte("Erreur lors de la modification. Veuillez vous assurer que vous êtes le médecin autorisé et que le contrat est publié dans sa version la plus récente.");
    }
}
async function loadPatientDataForAnalysis(patientWallet) {
    showLoader(true);
    try {
        const patientData = await contract.methods.getPatient(patientWallet).call({ from: currentAccount });
        if (!patientData || patientData.age === 0) {
            alerte("Patient introuvable ou données incomplètes.");
            return;
        }
        document.getElementById('input_age').value = patientData.age;
        const sexValue = patientData.sex === 'Homme' ? '1' : '0';
        document.getElementById('input_sex').value = sexValue;

        console.log(`Données du patient ${patientData.name} chargées dans l'analyse. Age: ${patientData.age}, Sex: ${patientData.sex} (${sexValue})`);
    } catch (error) {
        console.error("Erreur lors du chargement des données pour l'analyse:", error);
        alert("Erreur: Impossible de charger les données. Vérifiez l'adresse du patient.");
    } finally {
        hideLoader();
    }
}
function openTraitementModal(wallet, name) {
    selectedPatientWallet = wallet;
    selectedPatientName = name;
    document.getElementById("docDiagnostic").value = "";
    document.getElementById("docTraitement").value = "";
    document.getElementById("docReco").value = "";
    const modalTitle = document.querySelector("#traitementModal .modal-title");
    if (modalTitle) {
        modalTitle.textContent = `🩺 Diagnostic & Traitement — ${name}`;
    }
    $('#traitementModal').modal('show');
    console.log("Traitement pour patient:", wallet);
}
window.viewPatientRecord = viewPatientRecord;
window.updatePatientRecordHash = updatePatientRecordHash;
window.deletePatient = deletePatient;
window.sendDataForAIPrediction = sendDataForAIPrediction;
window.loadMyPatients = loadMyPatients; // 
window.loadDoctorProfile = loadDoctorProfile;
window.openModifyPatientAgeModal = openModifyPatientAgeModal;
window.modifyPatientAge = modifyPatientAge;
window.loadPatientDataForAnalysis = loadPatientDataForAnalysis;
window.showSection = showSection;
window.loadRiskDistributionStats = loadRiskDistributionStats;
window.loadRiskByAgeAndSexStats = loadRiskByAgeAndSexStats;
window.redirectToAIAnalysis = redirectToAIAnalysis; 
window.openTraitementModal = openTraitementModal;
window.saveTraitement = saveTraitement;
document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.addEventListener('click', function(event) {
        event.preventDefault();
        const sectionId = this.getAttribute('data-section');
        if (sectionId) {
            showSection(sectionId, this);
        }
    });
});
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
}
const addPatientForm = document.getElementById("addPatientForm");
if (addPatientForm) {
    addPatientForm.addEventListener("submit", addPatient);
}
const aiAnalysisForm = document.getElementById("aiAnalysisForm");
if (aiAnalysisForm) {
    aiAnalysisForm.addEventListener("submit", sendDataForAIPrediction);
}
window.addEventListener('load', () => {
    connectWallet().then(() => {
        const defaultLink = document.getElementById('nav-dashboard') || document.getElementById('nav-profile');
        const defaultSection = (defaultLink && defaultLink.getAttribute('data-section')) || 'profile-section';
        showSection(defaultSection, defaultLink);
    });
});