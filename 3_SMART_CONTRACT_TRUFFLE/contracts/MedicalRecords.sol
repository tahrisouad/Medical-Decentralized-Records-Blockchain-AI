// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract MedicalRecords {
    address public admin;
    struct Doctor {
        string id;
        string name;
        string specialty;
        uint256 age;
        string sex;
        address wallet;
    }
    struct Patient {
        string name;
        uint256 age;
        string sex;
        address wallet;
        string currentDataHash; 
        uint256 lastUpdated;
        string[] diagnosticsHistoryHashes; 
    }
    Doctor[] private doctorsList;
    Patient[] private patientsList;
    mapping(address => uint256) private doctorIndex;
    mapping(address => uint256) private patientIndex;
    mapping(address => bool) public authorizedDoctors;
    mapping(address => bool) public wasAuthorized;
    mapping(address => address[]) public doctorPatients;
    event DoctorAdded(address indexed wallet, string id, string name);
    event DoctorAuthorized(address indexed wallet);
    event PatientAdded(address indexed wallet, string name);
    event PatientDataHashUpdated(address indexed wallet, string dataHash, uint256 timestamp);
    event PatientDeleted(address indexed wallet);
    event DoctorDeleted(address indexed wallet);
    modifier onlyAdmin() {
        require(msg.sender == admin, "Seul l'admin est autorise");
        _;
    }
    modifier onlyAuthorizedDoctor() {
        require(authorizedDoctors[msg.sender] == true, "Seul le medecin autorise est permis");
        _;
    }
    modifier onlyAdminOrAuthorizedDoctor() {
        require(msg.sender == admin || authorizedDoctors[msg.sender] == true, "Vous n'avez pas la permission");
        _;
    }
    constructor() {
        admin = msg.sender;
    }
    function addDoctor(
        string calldata _id,
        string calldata _name,
        string calldata _specialty,
        uint256 _age,
        string calldata _sex,
        address _wallet
      ) external onlyAdmin {
        require(_wallet != address(0), "Adresse de portefeuille invalide");
        require(doctorIndex[_wallet] == 0, "Le medecin existe deja");
        Doctor memory d = Doctor({
            id: _id,
            name: _name,
            specialty: _specialty,
            age: _age,
            sex: _sex,
            wallet: _wallet
        });
        doctorsList.push(d);
        doctorIndex[_wallet] = doctorsList.length; 
        emit DoctorAdded(_wallet, _id, _name);
    }
    function authorizeDoctor(address _wallet) external onlyAdmin {
        require(doctorIndex[_wallet] != 0, "Medecin non enregistre");
        authorizedDoctors[_wallet] = true;
        wasAuthorized[_wallet] = true;
        emit DoctorAuthorized(_wallet);
    }
    function revokeDoctor(address _wallet) external onlyAdmin {
        require(doctorIndex[_wallet] != 0, "Medecin non enregistre");
        authorizedDoctors[_wallet] = false;
    }
    function deleteDoctor(address _wallet) external onlyAdmin {
        require(doctorIndex[_wallet] != 0, "Medecin non trouve");
        uint256 idx = doctorIndex[_wallet];
        uint256 arrayIndex = idx - 1;
        uint256 last = doctorsList.length - 1;
        authorizedDoctors[_wallet] = false;
        if (arrayIndex != last) {
            Doctor memory lastD = doctorsList[last];
            doctorsList[arrayIndex] = lastD;
            doctorIndex[lastD.wallet] = arrayIndex + 1;
        }
        doctorsList.pop();
        delete doctorIndex[_wallet];
        emit DoctorDeleted(_wallet);
    }
    function getAllDoctors() external view onlyAdmin returns (Doctor[] memory) {
        return doctorsList;
    }
    function getDoctor(address _wallet) external view returns (Doctor memory) {
        require(doctorIndex[_wallet] != 0, "Medecin non trouve");
        return doctorsList[doctorIndex[_wallet] - 1];
    }
    event DoctorInfoUpdated(address indexed wallet, uint256 newAge); 
    function updateDoctorInfo(
        address _wallet,
        uint256 _newAge
     ) external onlyAdmin {
        require(doctorIndex[_wallet] != 0, "Medecin non trouve pour mise a jour");
        uint256 arrayIndex = doctorIndex[_wallet] - 1;
        Doctor storage doc = doctorsList[arrayIndex];
        doc.age = _newAge;
        emit DoctorInfoUpdated(_wallet, _newAge);
    }
    function addPatient(
        string calldata _name,
        uint256 _age,
        string calldata _sex,
        address _wallet
      ) external onlyAuthorizedDoctor {
        require(_wallet != address(0), "Adresse de portefeuille invalide");
        require(patientIndex[_wallet] == 0, "Le patient existe deja");
        Patient memory newP = Patient({
            name: _name,
            age: _age,
            sex: _sex,
            wallet: _wallet,
            currentDataHash: "", 
            lastUpdated: block.timestamp,
            diagnosticsHistoryHashes: new string[](0)
        });
        patientsList.push(newP);
        patientIndex[_wallet] = patientsList.length; 
        doctorPatients[msg.sender].push(_wallet);
        emit PatientAdded(_wallet, _name);
    }
    function getPatient(address _patientWallet) 
        public 
        view 
        returns (
            uint256 id, 
            string memory name, 
            uint256 age, 
            string memory sex, 
            address wallet, 
            bool isExist
        ) 
     {
        uint256 index = patientIndex[_patientWallet];
        if (index == 0) {
            return (0, "", 0, "", address(0), false); 
        } 
        Patient storage p = patientsList[index - 1];    
        return (
            index,
            p.name,
            p.age,
            p.sex,
            p.wallet,
            true 
        );
    }
    function getAllPatients() external view onlyAdminOrAuthorizedDoctor returns (Patient[] memory) {
        return patientsList;
    }
    function getMyPatientsAddresses() public view returns (address[] memory) {
        return doctorPatients[msg.sender];
    }
    function getPatientRecord(address _wallet) external view returns (
        string memory name,
        uint256 age,
        string memory sex,
        string memory currentDataHash,
        uint256 lastUpdated,
        string[] memory diagnosticsHistoryHashes
      ) {
        require(patientIndex[_wallet] != 0, "Patient non trouve");
        require(msg.sender == _wallet || authorizedDoctors[msg.sender], "Acces refuse a ce dossier");   
        Patient storage p = patientsList[patientIndex[_wallet] - 1];
        return (
            p.name,
            p.age,
            p.sex,
            p.currentDataHash, 
            p.lastUpdated,
            p.diagnosticsHistoryHashes
        );
    }
    function updatePatientDataHash(
        address _wallet,
        string calldata _newDataHash
      ) external onlyAuthorizedDoctor {
        require(patientIndex[_wallet] != 0, "Patient non trouve");
        require(bytes(_newDataHash).length > 0, "Le Hash des donnees ne peut pas etre vide");
        Patient storage p = patientsList[patientIndex[_wallet] - 1];
        p.currentDataHash = _newDataHash;
        p.lastUpdated = block.timestamp;
        p.diagnosticsHistoryHashes.push(_newDataHash); 
        emit PatientDataHashUpdated(_wallet, _newDataHash, block.timestamp);
    }
    function updatePatientAge(
        address _patientWallet,
        uint256 _newAge
      ) external onlyAuthorizedDoctor {
        require(patientIndex[_patientWallet] != 0, "Patient non trouve pour mise a jour");
        require(_newAge < 150, "Age invalide");
        uint256 arrayIndex = patientIndex[_patientWallet] - 1;
        Patient storage p = patientsList[arrayIndex];
        p.age = _newAge;
    }
    function deletePatient(address _wallet) external onlyAuthorizedDoctor {
        require(patientIndex[_wallet] != 0, "Patient non trouve");
        uint256 idx = patientIndex[_wallet];
        uint256 arrayIndex = idx - 1;
        uint256 last = patientsList.length - 1;
        if (arrayIndex != last) {
            Patient memory lastP = patientsList[last];
            patientsList[arrayIndex] = lastP;
            patientIndex[lastP.wallet] = arrayIndex + 1;
        }
        patientsList.pop();
        delete patientIndex[_wallet];
        emit PatientDeleted(_wallet);
    }
    function isDoctorRegistered(address _wallet) external view returns (bool) {
        return doctorIndex[_wallet] != 0;
    }
    function isPatientRegistered(address _wallet) external view returns (bool) {
        return patientIndex[_wallet] != 0;
    }
    function transferOwnership(address _newOwner) external onlyAdmin {
        require(_newOwner != address(0), "Nouvelle adresse admin invalide");
        require(_newOwner != admin, "La nouvelle adresse est l'Admin actuel");
        admin = _newOwner; 
    }
    function isAdmin(address who) external view returns (bool) {
        return who == admin;
    }
}