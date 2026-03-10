import { initWeb3 } from "./web3.js";
let adminAddress = null;
let confirmAction = null; 
let tooltipList = [];
function showLoader() { document.getElementById('loader').style.display = 'block'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }
function toast(msg) { alert(msg); } 
function setupLogoutListener() {
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            toast("Déconnexion...");
            window.location.href = "index.html";
        });
    }
}
window.addEventListener('load', async () => {
    setupSectionNavigation(); 
    setupLogoutListener();
    await connectWallet();
    setupSearch();
});
export async function connectWallet() {
    try {
        showLoader();
        const initResult = await initWeb3();
        if (!initResult) throw new Error("MetaMask init failed");
        const { web3, accounts, contract } = initResult;
        window.web3 = web3;
        window.contract = contract;
        window.accounts = accounts;
        adminAddress = accounts[0];
        document.getElementById('adminWallet').innerText = adminAddress;
        const isAdmin = await window.contract.methods.isAdmin(adminAddress).call();
        if (!isAdmin) {
            toast("Vous n'êtes pas admin. Redirection...");
            window.location.href = "index.html";
            return;
        }
        setupSystemHealthChecks();
        await loadParameters();
        await refreshDashboard();
    } catch (err) {
        console.error("connectWallet:", err);
        toast("Erreur de connexion. Vérifiez MetaMask.");
    } finally {
        hideLoader();
    }
}
async function refreshDashboard() {
    showLoader();
    try {
        await loadStats();
        await getAllDoctors();
    } catch (err) {
        console.error("refreshDashboard:", err);
    } finally {
        hideLoader();
    }
}
async function loadStats() {
    try {
        const doctors = await window.contract.methods.getAllDoctors().call({ from: adminAddress });
        const patients = await window.contract.methods.getAllPatients().call({ from: adminAddress });
        document.getElementById('statDoctors').innerText = doctors.length;
        document.getElementById('statPatients').innerText = patients.length;
        const dossiers = patients.filter(p => p.currentDataHash && p.currentDataHash.length > 5).length;
        document.getElementById('statDossiers').innerText = dossiers;
        document.getElementById('ipfsTotalHashes').innerText = dossiers; 
        document.getElementById('statCritical').innerText = dossiers;
        await loadAdvancedStats(doctors, patients);
        drawDoctorSexChart(doctors);
        drawHashMovementChart(patients); 
        await loadContractEvents();
    } catch (err) {
        console.error("loadStats:", err);
    }
}
async function loadAdvancedStats(doctors, patients) {
    let unauthorizedCount = 0;
    for (const doc of doctors) {
        const isAuthorized = await window.contract.methods.authorizedDoctors(doc.wallet).call();
        if (!isAuthorized) {
            unauthorizedCount++;
        }
    }
    document.getElementById('statUnauthorizedDoctors').innerText = unauthorizedCount;
    let totalDelaySeconds = 0;
    let recordsCount = 0;
    const now = Math.floor(Date.now() / 1000);
    patients.forEach(p => {
        if (p.currentDataHash && p.currentDataHash.length > 5 && p.lastUpdated > 0) {
            totalDelaySeconds += (now - Number(p.lastUpdated));
            recordsCount++;
        }
    });
    if (recordsCount > 0) {
        const avgDelaySeconds = totalDelaySeconds / recordsCount;
        const avgDelayDays = avgDelaySeconds / (60 * 60 * 24);
        let delayText;
        if (avgDelayDays >= 1) {
            delayText = `${avgDelayDays.toFixed(1)} Jours`;
        } else {
            const avgDelayHours = avgDelaySeconds / (60 * 60);
            delayText = `${avgDelayHours.toFixed(1)} Heures`;
        }
        document.getElementById('statAvgUpdateDelay').innerText = delayText;
    } else {
        document.getElementById('statAvgUpdateDelay').innerText = "N/A";
    }
}
function drawDoctorSexChart(doctors) {
    const counts = doctors.reduce((acc, doc) => {
        let sexKey = 'Autre';
        if (doc.sex === 'Homme') {
            sexKey = 'Homme';
        } 
        else if (doc.sex === 'Femme') {
            sexKey = 'Femme';
        }
        acc[sexKey] = (acc[sexKey] || 0) + 1;
        return acc;
    }, {});
    const maleCount = counts['Homme'] || 0;
    const femaleCount = counts['Femme'] || 0;
    const ctx = document.getElementById('doctorSexChart').getContext('2d');
    if (window.doctorSexChartInstance) {
        window.doctorSexChartInstance.destroy();
    }
    window.doctorSexChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Hommes', 'Femmes'],
            datasets: [{
                data: [maleCount, femaleCount],
                backgroundColor: ['#0d6efd', '#dc3545'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: false }
            }
        }
    });
}
function drawHashMovementChart(patients) {
    const dates = {};
    const days = 7; 
    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates[date.toDateString()] = 0; 
    }
    patients.forEach(p => {
        if (p.lastUpdated && p.currentDataHash && p.currentDataHash.length > 5) {
            const updateDate = new Date(Number(p.lastUpdated) * 1000);
            const dateString = updateDate.toDateString();
            if (dates.hasOwnProperty(dateString)) {
                dates[dateString]++;
            }
        }
    });
    const labels = Object.keys(dates).reverse().map(d => new Date(d).toLocaleDateString());
    const data = Object.values(dates).reverse();
    const ctx = document.getElementById('hashMovementChart').getContext('2d');
    if (window.hashMovementChartInstance) {
        window.hashMovementChartInstance.destroy();
    }
    window.hashMovementChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nouveaux Hashes / Jour',
                data: data,
                borderColor: '#28a745',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, precision: 0 } },
            plugins: { legend: { display: true } }
        }
    });
}
async function setupSystemHealthChecks() {
    const statusElement = document.getElementById('statBlockchainStatus');
    const ipfsStatusElement = document.getElementById('statIpfsStatus');
    ipfsStatusElement.innerHTML = `<span class="badge bg-success">Opérationnel</span>`; 
    try {
        if (window.web3 && window.web3.eth) {
            const isListening = await window.web3.eth.net.isListening();
            if (isListening) {
                statusElement.innerText = "Connecté";
                statusElement.classList.remove('bg-secondary', 'bg-danger');
                statusElement.classList.add('bg-success');
            } else {
                statusElement.innerText = "Déconnecté";
                statusElement.classList.remove('bg-secondary', 'bg-success');
                statusElement.classList.add('bg-danger');
            }
        } else {
            statusElement.innerText = "En attente...";
            statusElement.classList.remove('bg-danger', 'bg-success');
            statusElement.classList.add('bg-secondary');
        }
    } catch (e) {
        console.error("Blockchain Check Error:", e);
        statusElement.innerText = "Erreur (Web3)";
        statusElement.classList.remove('bg-success', 'bg-secondary');
        statusElement.classList.add('bg-danger');
    }
}
async function loadContractEvents() {
    const list = document.getElementById('contractEventsList');
    list.innerHTML = '';
    try {
        if (!window.web3 || !window.contract) throw new Error("Web3 or Contract not initialized");
        
        const latestBlock = await window.web3.eth.getBlockNumber();
        const startBlock = latestBlock >= 500 ? latestBlock - 500 : 0; 

        const pastEvents = await window.contract.getPastEvents('allEvents', {
            fromBlock: startBlock,
            toBlock: 'latest'
        });
        const latest5 = pastEvents.slice(-5).reverse(); 
        if (latest5.length === 0) {
            list.innerHTML = `<li class="list-group-item text-muted">Aucun événement récent trouvé.</li>`;
            return;
        }
        latest5.forEach(event => {
            let desc = `Événement ${event.event}: `;
            let type = 'list-group-item-light';
            switch (event.event) {
                case 'DoctorAdded':
                    desc = ` Ajout: Docteur ${event.returnValues.name} (${event.returnValues.wallet.slice(0, 6)}...) enregistré.`;
                    type = 'list-group-item-primary';
                    break;
                case 'DoctorAuthorized':
                    desc = ` Autorisation: Portefeuille ${event.returnValues.wallet.slice(0, 6)}... a été autorisé.`;
                    type = 'list-group-item-success';
                    break;
                case 'DoctorRevoked':
                    desc = ` Révocation: Portefeuille ${event.returnValues.wallet.slice(0, 6)}... révoqué.`;
                    type = 'list-group-item-warning';
                    break;
                case 'DoctorDeleted': 
                desc = ` Suppression: Docteur ${event.returnValues.wallet.slice(0, 6)}... a été supprimé.`;
                type = 'list-group-item-danger'; 
                    break;
                case 'PatientAdded':
                case 'PatientDataHashUpdated':
                    return; 
                default:
                    desc += event.event;
            } 
            const timeString = ` (Bloc ${event.blockNumber})`;
            const li = document.createElement('li');
            li.className = `list-group-item ${type}`;
            li.innerHTML = `<strong>${desc}</strong><small class="float-end text-muted">${timeString}</small>`;
            list.appendChild(li);
        });
    } catch (e) {
        console.error("Erreur lors du chargement des événements:", e);
        list.innerHTML = `<li class="list-group-item list-group-item-danger">Erreur: Impossible de charger les événements du contrat.</li>`;
    }
}
export async function loadAllContractEvents() {
    const list = document.getElementById('eventsTableBody');
    list.innerHTML = ''; 
    showLoader();
    try {
        if (!window.web3 || !window.contract) throw new Error("Web3 or Contract not initialized");    
        const latestBlock = await window.web3.eth.getBlockNumber();
        const startBlock = latestBlock >= 500 ? latestBlock - 500 : 0; 
        const pastEvents = await window.contract.getPastEvents('allEvents', {
            fromBlock: startBlock,
            toBlock: 'latest'
        });
        const allEvents = pastEvents.reverse(); 
        if (allEvents.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Aucun événement trouvé dans les ${latestBlock - startBlock} derniers blocs.</td></tr>`;
            return;
        }
        allEvents.forEach(event => {
            let desc = null;
            let type = '';
            let badgeClass = '';
            switch (event.event) {
                case 'PatientAdded':
                    desc = `Ajout Patient: Le Dr. a ajouté le patient ${event.returnValues.name} (${event.returnValues.wallet.slice(0, 6)}...).`;
                    type = 'Ajout Patient';
                    badgeClass = 'bg-info';
                    break;
                case 'PatientDataHashUpdated':
                    desc = `Mise à Jour: Le Dr. a mis à jour le dossier du patient ${event.returnValues.wallet.slice(0, 6)}...`;
                    type = 'MAJ Dossier';
                    badgeClass = 'bg-warning';
                    break;
                case 'DoctorAdded':
                case 'DoctorAuthorized':
                case 'DoctorRevoked':
                    return; 
                default:
                    return; 
            }
            if (desc) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="badge ${badgeClass}">${type}</span></td>
                    <td>${desc}</td>
                    <td><small>${event.blockNumber}</small></td>
                    <td><code class="small">${event.transactionHash.slice(0, 8)}...${event.transactionHash.slice(-6)}</code></td>
                `;
                list.appendChild(tr);
            }
        });
    } catch (e) {
        console.error("Erreur lors du chargement des logs:", e);
        list.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erreur: Impossible de charger l'historique des événements.</td></tr>`;
    } finally {
        hideLoader();
    }
}
export async function getAllDoctors() {
    const tbody = document.querySelector('#doctorsTable tbody');
    tbody.innerHTML = '';
    try {
        const doctors = await window.contract.methods.getAllDoctors().call({ from: adminAddress });
        const authorizationPromises = doctors.map(doc => 
            window.contract.methods.authorizedDoctors(doc.wallet).call()
        );
        const authorizations = await Promise.all(authorizationPromises);
        doctors.forEach((doc, index) => {
            const isAuthorized = authorizations[index];           
            const authIcon = isAuthorized 
                ? '<span class="badge bg-success">Autorisé ✔</span>' 
                : '<span class="badge bg-danger">Non Autorisé ✖</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(doc.id)}</td>
                <td>${escapeHtml(doc.name)}</td>
                <td>${escapeHtml(doc.specialty)}</td>
                <td>${escapeHtml(doc.age)}</td>
                <td>${escapeHtml(doc.sex)}</td>
                <td>${authIcon}</td> 
                <td><code class="small">${doc.wallet.slice(0, 6)}...${doc.wallet.slice(-4)}</code></td>
                <td>
                    <div class="d-flex flex-nowrap btn-group" role="group" aria-label="Actions">
                        
                        <button 
                            class="btn btn-sm btn-info" 
                            onclick="openEditDoctorModal('${doc.id}', '${doc.name}', '${doc.age}', '${doc.wallet}')"
                            title="Modifier les informations"
                            data-bs-toggle="tooltip" data-bs-placement="top"
                        >
                            &#9998; 
                        </button>
                        
                        ${isAuthorized 
                            ? `<button 
                                class="btn btn-sm btn-warning" 
                                onclick="revokeDoctor('${doc.wallet}')"
                                title="Révoquer l'autorisation"
                                data-bs-toggle="tooltip" data-bs-placement="top"
                            >
                                🚫
                            </button>`
                            : `<button 
                                class="btn btn-sm btn-success" 
                                onclick="authorizeDoctor('${doc.wallet}')"
                                title="Autoriser le docteur"
                                data-bs-toggle="tooltip" data-bs-placement="top"
                            >
                                ✅
                            </button>`
                        }
                        
                        <button 
                            class="btn btn-sm btn-danger" 
                            onclick="confirmDeleteDoctor('${doc.wallet}','${doc.name}')"
                            title="Supprimer le docteur"
                            data-bs-toggle="tooltip" data-bs-placement="top"
                        >
                            🗑
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipList.forEach(tooltip => tooltip.hide()); 
        tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });

    } catch (err) {
        console.error("getAllDoctors:", err);
        toast("Erreur lors du chargement des docteurs.");
    }
}
export async function addDoctor() {
    try {
        const docId = document.getElementById('docId').value.trim();
        const docName = document.getElementById('docName').value.trim();
        const docSpecialty = document.getElementById('docSpecialty').value.trim();
        const docAge = Number(document.getElementById('docAge').value);
        const docSex = document.getElementById('docSex').value;
        const docAddress = document.getElementById('docAddress').value.trim(); 
        if (!docId || !docName || !docAddress) {
            toast("Remplissez au moins ID, Nom et Wallet.");
            return;
        }
        showLoader();        
        await window.contract.methods.addDoctor(
            docId, 
            docName, 
            docSpecialty, 
            docAge, 
            docSex, 
            docAddress 
        ).send({ from: adminAddress });
        toast("Docteur ajouté !");
        resetDoctorForm();
        await refreshDashboard();
    } catch (err) {
        console.error("addDoctor:", err);
        toast("Erreur lors de l'ajout (voir console)."); 
    } finally {
        hideLoader();
    }
}
export async function authorizeDoctor(wallet) {
    if(!confirm("Autoriser ce médecin à écrire ?")) return;
    try {
        showLoader();
        await window.contract.methods.authorizeDoctor(wallet).send({ from: adminAddress });
        toast("Médecin autorisé.");
        await refreshDashboard();
    } catch (err) { console.error(err); toast("Erreur autorisation"); }
    finally { hideLoader(); }
}
export async function revokeDoctor(wallet) {
    if(!confirm("Révoquer l'autorisation de ce médecin ؟")) return;
    try {
        showLoader();
        await window.contract.methods.revokeDoctor(wallet).send({ from: adminAddress });
        toast("Autorisation révoquée.");
        await refreshDashboard();
    } catch (err) { console.error(err); toast("Erreur révocation"); }
    finally { hideLoader(); }
}
export async function deleteDoctor(wallet) {
    try {
        showLoader();
        await window.contract.methods.deleteDoctor(wallet).send({ from: adminAddress });
        toast("Docteur supprimé.");
        await refreshDashboard();
    } catch (err) {
        console.error("deleteDoctor:", err);
        toast("Erreur suppression (vérifiez fonction contrat).");
    } finally { hideLoader(); }
}
export function openEditDoctorModal(id, name, age, wallet) {
    document.getElementById('editDocNameDisplay').innerText = name;
    document.getElementById('editDocIdDisplay').innerText = id;
    document.getElementById('editDocWalletDisplay').innerText = wallet;
    document.getElementById('editDocWalletHidden').value = wallet; 
    document.getElementById('editDocAge').value = Number(age);
    const editModal = new bootstrap.Modal(document.getElementById('editDoctorModal'));
    editModal.show();
}
export async function saveDoctorChanges() {
    const walletToUpdate = document.getElementById('editDocWalletHidden').value;
    const newAge = Number(document.getElementById('editDocAge').value);
    if (!walletToUpdate) {
        toast("Erreur: Portefeuille non spécifié.");
        return;
    }
    const editModal = bootstrap.Modal.getInstance(document.getElementById('editDoctorModal'));
    editModal.hide();
    try {
        if(!confirm(`Confirmer la mise à jour des informations pour le docteur ${walletToUpdate.slice(0, 6)}...?`)) return;
        showLoader();
        await window.contract.methods.updateDoctorInfo(
            walletToUpdate, 
            newAge, 
        ).send({ from: adminAddress });
        toast("Informations du docteur mises à jour !");
        await refreshDashboard();
    } catch (err) {
        console.error("saveDoctorChanges:", err);
        toast("Erreur lors de la mise à jour (vérifiez la fonction du contrat).");
    } finally {
        hideLoader();
    }
}
document.getElementById('btnSaveDoctorChanges').addEventListener('click', saveDoctorChanges);
window.openEditDoctorModal = openEditDoctorModal;
export function confirmDeleteDoctor(wallet, name) {
    const confirmText = document.getElementById('confirmText');
    confirmText.innerText = `Supprimer le docteur "${name}" ؟`;
    const confModal = new bootstrap.Modal(document.getElementById('confirmModal'));
    confModal.show();
    const yesBtn = document.getElementById('confirmYesBtn');
    const handler = async () => {
        confModal.hide();
        await deleteDoctor(wallet);
        yesBtn.removeEventListener('click', handler);
    };
    yesBtn.addEventListener('click', handler);
}
export function resetDoctorForm() {
    document.getElementById('docId').value = '';
    document.getElementById('docName').value = '';
    document.getElementById('docSpecialty').value = 'Cardiologie';
    document.getElementById('docAge').value = '40';
    document.getElementById('docSex').value = 'Homme';
    document.getElementById('docAddress').value = '';
}
function setupSearch() {
    const input = document.getElementById('searchDoctor');
    input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        document.querySelectorAll('#doctorsTable tbody tr').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}
function escapeHtml(s = '') {
    return String(s)
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;');
}
document.getElementById('btnAddDoctor').addEventListener('click', addDoctor);
document.getElementById('btnResetDoctor').addEventListener('click', resetDoctorForm);
function showSection(sectionId) {
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active-section');
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active-section');
    }
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar .nav-link[data-section="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}
function setupSectionNavigation() {
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = e.currentTarget.getAttribute('data-section');
            if (targetSection) {
                showSection(targetSection);
                if (targetSection === 'logs-section') {
                    loadAllContractEvents(); 
                }
            }
        });
    });
    showSection('dashboard-section');
}
async function loadParameters() {
    try {
        if (!window.web3 || !window.contract) throw new Error("Web3 or Contract not initialized");
        const contractAddress = window.contract.options.address;
        document.getElementById('contractAddressDisplay').innerText = contractAddress || 'N/A';
        const networkId = await window.web3.eth.net.getId();
        let networkName = `ID: ${networkId}`;
        switch (networkId) {
            case 1: networkName += ' (Mainnet)'; break;
            case 3: networkName += ' (Ropsten)'; break;
            case 4: networkName += ' (Rinkeby)'; break;
            case 5: networkName += ' (Goerli)'; break;
            case 1337: networkName += ' (Ganache/Local)'; break;
        }
        document.getElementById('networkIdDisplay').innerText = networkName;
        window.copyToClipboard = (elementId) => {
            const textToCopy = document.getElementById(elementId).innerText;
            navigator.clipboard.writeText(textToCopy);
            toast("Adresse copiée!");
        };
        document.getElementById('transferOwnershipBtn').addEventListener('click', async () => {
            const newOwner = document.getElementById('newOwnerWallet').value.trim();
            if (!newOwner) {
                toast("Veuillez entrer une adresse valide.");
                return;
            }
            if (!confirm(`ATTENTION: Êtes-vous sûr de vouloir transférer la propriété du contrat à ${newOwner.slice(0, 10)}...? Cette action est irréversible !`)) {
                return;
            }
            try {
                showLoader();
                await window.contract.methods.transferOwnership(newOwner).send({ from: adminAddress });
                toast("Propriété transférée avec succès. Déconnexion...");
                setTimeout(() => window.location.reload(), 3000); 
            } catch (error) {
                console.error("Transfer Ownership Error:", error);
                toast("Erreur lors du transfert de propriété. Vérifiez les logs de la console.");
            } finally {
                hideLoader();
            }
        });
    } catch (err) {
        console.error("loadParameters:", err);
    }
}
window.authorizeDoctor = authorizeDoctor;
window.revokeDoctor = revokeDoctor;
window.confirmDeleteDoctor = confirmDeleteDoctor;
window.deleteDoctor = deleteDoctor;