// Constants for sheet names and configuration
const USERS_SHEET = 'Users';
const APPOINTMENTS_SHEET = 'Appointments';
const DOCTORS_SHEET = 'Doctors';
const PRESCRIPTIONS_SHEET = 'Prescriptions';
const PATIENTS_SHEET = 'Patients';
const MAX_LOGIN_ATTEMPTS = 3;
const INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

// Initialize the web app
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Client-Side')
      .setTitle('VCU Student Healthcare Application')
      .setFaviconUrl('https://upload.wikimedia.org/wikipedia/en/thumb/1/18/VCU_Athletics_Logo.svg/800px-VCU_Athletics_Logo.svg.png')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// User Management Functions
function validateLogin(username, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      return {
        username: data[i][0],
        fullName: data[i][2],
        email: data[i][3],
        role: data[i][4] || 'USER' // Default to USER if role is not specified
      };
    }
  }
  return null;
}

function validateProviderRole(username) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return data[i][4] === 'PROVIDER';
    }
  }
  return false;
}

function registerUser(username, password, fullName, email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  
  // Validate input
  if (username.length < 5) {
    throw new Error('Username must be at least 5 characters long');
  }
  
  if (password.length < 8 || 
      !/[A-Za-z]/.test(password) || 
      !/[0-9]/.test(password) || 
      !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('Password must meet complexity requirements');
  }
  
  // Check if username already exists
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      throw new Error('Username already exists');
    }
  }
  
  // Add new user
  sheet.appendRow([username, password, fullName, email, null, new Date()]);
  
  // Send welcome email
  sendWelcomeEmail(email, fullName);
}

// Appointment Management Functions
function getAppointments(username) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const appointments = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] == username) {
      appointments.push({
        id: data[i][0],
        username: data[i][1],
        date: data[i][2],
        time: data[i][3],
        location: data[i][4],
        doctor: data[i][5],
        reason: data[i][6]
      });
    }
  }
  Logger.log(appointments);
  
  return JSON.stringify(appointments);
}

function createAppointment(appointmentData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET);
  const id = Utilities.getUuid();
  
  // Validate appointment date isn't in the past
  const appointmentDate = new Date(appointmentData.date + " " + appointmentData.time);
  if (appointmentDate < new Date()) {
    throw new Error('Cannot schedule appointments in the past!');
  }
  
  sheet.appendRow([
    id,
    appointmentData.username,
    appointmentData.date,
    appointmentData.time,
    appointmentData.location,
    appointmentData.doctor,
    appointmentData.reason,
    new Date() // creation timestamp
  ]);
  
  // Send confirmation email
  const userEmail = getUserEmail(appointmentData.username);
  if (userEmail) {
    sendAppointmentConfirmation(userEmail, appointmentData);
  }
  
  return id;
}

function editAppointment(appointmentId, updatedData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === appointmentId) {
      // Check if appointment is within 24 hours
      const appointmentDate = new Date(data[i][2] + " " + data[i][3]);
      if (appointmentDate - new Date() < 24 * 60 * 60 * 1000) {
        throw new Error('Cannot modify appointments within 24 hours');
      }
      
      // Update appointment
      sheet.getRange(i + 1, 3).setValue(updatedData.date);
      sheet.getRange(i + 1, 4).setValue(updatedData.time);
      sheet.getRange(i + 1, 7).setValue(updatedData.reason);
      
      // Send update email
      const userEmail = getUserEmail(data[i][1]);
      if (userEmail) {
        sendAppointmentUpdateEmail(userEmail, {
          ...updatedData,
          doctor: data[i][5],
          location: data[i][4]
        });
      }
      
      return true;
    }
  }
  
  throw new Error('Appointment not found');
}

function deleteAppointment(appointmentId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === appointmentId) {
      // Check if appointment is within 24 hours
      const appointmentDate = new Date(data[i][2] + " " + data[i][3]);
      if (appointmentDate - new Date() < 24 * 60 * 60 * 1000) {
        throw new Error('Cannot delete appointments within 24 hours');
      }
      
      // Send cancellation email before deleting
      const userEmail = getUserEmail(data[i][1]);
      if (userEmail) {
        sendAppointmentCancellationEmail(userEmail, {
          date: data[i][2],
          time: data[i][3],
          doctor: data[i][5],
          location: data[i][4]
        });
      }
      
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  
  throw new Error('Appointment not found');
}

function searchAppointments(username, searchDate) {
  const appointments = getAppointments(username);
  return appointments.filter(apt => apt.date === searchDate);
}

// Doctor Management
function getDoctors() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DOCTORS_SHEET);
  const data = sheet.getDataRange().getValues();
  const doctors = [];
  
  for (let i = 1; i < data.length; i++) {
    doctors.push({
      id: data[i][0],
      name: data[i][1],
      specialty: data[i][2]
    });
  }
  
  return doctors;
}

// Email Functions
function sendWelcomeEmail(email, fullName) {
  const subject = 'Welcome to VCU Student Healthcare';
  const body = `Dear ${fullName},\n\n` +
               'Welcome to VCU Student Healthcare! Your account has been successfully created.\n\n' +
               'You can now log in to schedule appointments, manage prescriptions, and access your patient information.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendAppointmentConfirmation(email, appointmentData) {
  const subject = 'Appointment Confirmation';
  const body = `Dear Patient,\n\n` +
               `Your appointment has been scheduled for ${appointmentData.date} at ${appointmentData.time}\n` +
               `with Dr. ${appointmentData.doctor} at ${appointmentData.location}.\n\n` +
               `Reason for visit: ${appointmentData.reason}\n\n` +
               'Please arrive 15 minutes before your scheduled time.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendAppointmentUpdateEmail(email, appointmentData) {
  const subject = 'Appointment Update Confirmation';
  const body = `Dear Patient,\n\n` +
               `Your appointment has been updated to ${appointmentData.date} at ${appointmentData.time}\n` +
               `with Dr. ${appointmentData.doctor} at ${appointmentData.location}.\n\n` +
               `Updated reason for visit: ${appointmentData.reason}\n\n` +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendAppointmentCancellationEmail(email, appointmentData) {
  const subject = 'Appointment Cancellation Confirmation';
  const body = `Dear Patient,\n\n` +
               `Your appointment scheduled for ${appointmentData.date} at ${appointmentData.time}\n` +
               `with Dr. ${appointmentData.doctor} at ${appointmentData.location} has been cancelled.\n\n` +
               'Please schedule a new appointment if needed.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

// Utility Functions
function getUserEmail(username) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return data[i][3];
    }
  }
  
  return null;
}

// Prescription Management Functions
function getPrescriptions(username) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESCRIPTIONS_SHEET);
  const data = sheet.getDataRange().getValues();
  const prescriptions = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === username) {
      prescriptions.push({
        id: data[i][0],
        username: data[i][1],
        medication: data[i][2],
        dosage: data[i][3],
        frequency: data[i][4],
        pharmacy: data[i][5],
        nextRefillDate: data[i][6],
        lastRefillDate: data[i][7]
      });
    }
  }
  
  return JSON.stringify(prescriptions);
}

function createPrescription(prescriptionData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESCRIPTIONS_SHEET);
  const id = Utilities.getUuid();
  
  const today = new Date();
  const nextRefillDate = new Date(today.getTime() + (prescriptionData.frequency * 24 * 60 * 60 * 1000));
  
  sheet.appendRow([
    id,
    prescriptionData.username,
    prescriptionData.medication,
    prescriptionData.dosage,
    prescriptionData.frequency,
    prescriptionData.pharmacy,
    nextRefillDate,
    today, // last refill date
    new Date() // creation timestamp
  ]);
  
  // Send confirmation email
  const userEmail = getUserEmail(prescriptionData.username);
  if (userEmail) {
    sendPrescriptionConfirmation(userEmail, prescriptionData);
  }
  
  return id;
}

function editPrescription(prescriptionId, updatedData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESCRIPTIONS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === prescriptionId) {
      // Update prescription data
      sheet.getRange(i + 1, 3).setValue(updatedData.medication); // medication
      sheet.getRange(i + 1, 4).setValue(updatedData.dosage);     // dosage
      sheet.getRange(i + 1, 5).setValue(updatedData.frequency);  // frequency
      sheet.getRange(i + 1, 6).setValue(updatedData.pharmacy);   // pharmacy
      
      // Recalculate next refill date based on last refill date
      const lastRefillDate = new Date(data[i][7]);
      const nextRefillDate = new Date(lastRefillDate.getTime() + (updatedData.frequency * 24 * 60 * 60 * 1000));
      sheet.getRange(i + 1, 7).setValue(nextRefillDate);
      
      // Send update email
      const userEmail = getUserEmail(data[i][1]);
      if (userEmail) {
        sendPrescriptionUpdateEmail(userEmail, {
          ...updatedData,
          nextRefillDate: nextRefillDate
        });
      }
      
      return true;
    }
  }
  
  throw new Error('Prescription not found');
}

function deletePrescription(prescriptionId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESCRIPTIONS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === prescriptionId) {
      // Send cancellation email before deleting
      const userEmail = getUserEmail(data[i][1]);
      if (userEmail) {
        sendPrescriptionCancellationEmail(userEmail, {
          medication: data[i][2],
          pharmacy: data[i][5]
        });
      }
      
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  
  throw new Error('Prescription not found');
}

function refillPrescription(prescriptionId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESCRIPTIONS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === prescriptionId) {
      const nextRefillDate = new Date(data[i][6]);
      const today = new Date();
      
      // Check if it's too early to refill
      if (nextRefillDate > today) {
        throw new Error(`Cannot refill until ${nextRefillDate.toLocaleDateString()}`);
      }
      
      // Update last refill date to today
      const newLastRefillDate = today;
      sheet.getRange(i + 1, 8).setValue(newLastRefillDate);
      
      // Calculate and update next refill date
      const frequency = data[i][4]; // Get frequency in days
      const newNextRefillDate = new Date(today.getTime() + (frequency * 24 * 60 * 60 * 1000));
      sheet.getRange(i + 1, 7).setValue(newNextRefillDate);
      
      // Send refill confirmation email
      const userEmail = getUserEmail(data[i][1]);
      if (userEmail) {
        sendPrescriptionRefillConfirmation(userEmail, {
          medication: data[i][2],
          dosage: data[i][3],
          pharmacy: data[i][5],
          nextRefillDate: newNextRefillDate
        });
      }
      
      return true;
    }
  }
  
  throw new Error('Prescription not found');
}

function sendPrescriptionConfirmation(email, prescriptionData) {
  const subject = 'New Prescription Created';
  const body = `Dear Patient,\n\n` +
               `Your prescription has been created:\n\n` +
               `Medication: ${prescriptionData.medication}\n` +
               `Dosage: ${prescriptionData.dosage}mg\n` +
               `Frequency: Every ${prescriptionData.frequency} days\n` +
               `Pharmacy: ${prescriptionData.pharmacy}\n\n` +
               `You can refill this prescription in ${prescriptionData.frequency} days.\n\n` +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendPrescriptionUpdateEmail(email, prescriptionData) {
  const subject = 'Prescription Update Confirmation';
  const body = `Dear Patient,\n\n` +
               `Your prescription has been updated:\n\n` +
               `Medication: ${prescriptionData.medication}\n` +
               `Dosage: ${prescriptionData.dosage}mg\n` +
               `Frequency: Every ${prescriptionData.frequency} days\n` +
               `Pharmacy: ${prescriptionData.pharmacy}\n\n` +
               `Next refill available: ${new Date(prescriptionData.nextRefillDate).toLocaleDateString()}\n\n` +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendPrescriptionCancellationEmail(email, prescriptionData) {
  const subject = 'Prescription Cancellation Confirmation';
  const body = `Dear Patient,\n\n` +
               `Your prescription has been cancelled:\n\n` +
               `Medication: ${prescriptionData.medication}\n` +
               `Pharmacy: ${prescriptionData.pharmacy}\n\n` +
               'If you need this prescription renewed, please schedule an appointment with your healthcare provider.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendPrescriptionRefillConfirmation(email, prescriptionData) {
  const subject = 'Prescription Refill Confirmation';
  const body = `Dear Patient,\n\n` +
               `Your prescription refill has been processed:\n\n` +
               `Medication: ${prescriptionData.medication}\n` +
               `Dosage: ${prescriptionData.dosage}mg\n` +
               `Pharmacy: ${prescriptionData.pharmacy}\n\n` +
               `Next refill will be available: ${new Date(prescriptionData.nextRefillDate).toLocaleDateString()}\n\n` +
               'Please pick up your prescription from the pharmacy during their business hours.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

// Patient Management Functions
function addPatient(patientData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const id = Utilities.getUuid();
  const now = new Date();
  
  // Validate required fields
  if (!patientData.name || !patientData.sex || !patientData.email || !patientData.phone) {
    throw new Error('Missing required patient information');
  }
  
  // Add new patient with additional fields
  sheet.appendRow([
    id,
    patientData.name,
    patientData.sex,
    patientData.gender || patientData.sex, // Default to sex if gender not specified
    patientData.insuranceInfo,
    patientData.email,
    patientData.phone,
    JSON.stringify(patientData.guardians || []),
    JSON.stringify(patientData.medicalConditions || []),
    now, // creation date
    null, // deletion date
    JSON.stringify([]), // previous versions
    patientData.createdBy, // username of healthcare provider
    patientData.notes || '', // New field for notes
    patientData.medicalHistory || '' // New field for medical history
  ]);
  
  // Send confirmation emails
  sendPatientCreationEmail(patientData.email, patientData.name);
  sendProviderConfirmationEmail(getUserEmail(patientData.createdBy), patientData);
  
  return id;
}

function searchPatients(query, providerUsername, password) {
  // Verify provider credentials first
  if (!validateProviderPassword(providerUsername, password)) {
    throw new Error('Authentication failed');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const patients = [];
  
  // Skip header row, search for patients
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toLowerCase().includes(query.toLowerCase())) { // Check name and not deleted
      patients.push({
        id: data[i][0],
        name: data[i][1],
        sex: data[i][2],
        gender: data[i][3],
        insuranceInfo: data[i][4],
        email: data[i][5],
        phone: data[i][6],
        guardians: JSON.parse(data[i][7]),
        medicalConditions: JSON.parse(data[i][8])
      });
    }
  }
  
  return patients;
}

function getPatient(patientId, providerUsername, password) {
  // Verify provider credentials first
  if (!validateProviderPassword(providerUsername, password)) {
    throw new Error('Authentication failed');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === patientId) {
      if (data[i][10]) { // Check if marked for deletion
        const deletionDate = new Date(data[i][10]);
        return JSON.stringify({
          ...buildPatientObject(data[i]),
          deletionDate: deletionDate
        });
      }
      return JSON.stringify(buildPatientObject(data[i]));
    }
  }
  
  throw new Error('Patient not found');
}

function updatePatient(patientId, updatedData, providerUsername, password) {
  // Verify provider credentials first
  if (!validateProviderPassword(providerUsername, password)) {
    throw new Error('Authentication failed');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === patientId) {
      // Store current version in previous versions array
      const previousVersions = JSON.parse(data[i][11]);
      const currentVersion = buildPatientObject(data[i]);
      previousVersions.push({
        data: currentVersion,
        timestamp: new Date().toISOString()
      });
      
      // Update fields
      sheet.getRange(i + 1, 2).setValue(updatedData.name);
      sheet.getRange(i + 1, 3).setValue(updatedData.sex);
      sheet.getRange(i + 1, 4).setValue(updatedData.gender);
      sheet.getRange(i + 1, 5).setValue(updatedData.insuranceInfo);
      sheet.getRange(i + 1, 6).setValue(updatedData.email);
      sheet.getRange(i + 1, 7).setValue(updatedData.phone);
      sheet.getRange(i + 1, 8).setValue(JSON.stringify(updatedData.guardians));
      sheet.getRange(i + 1, 9).setValue(JSON.stringify(updatedData.medicalConditions));
      sheet.getRange(i + 1, 12).setValue(JSON.stringify(previousVersions));
      sheet.getRange(i + 1, 14).setValue(updatedData.notes); // Update notes
      sheet.getRange(i + 1, 15).setValue(updatedData.medicalHistory); // Update medical history
      
      // Send update confirmation
      sendPatientUpdateEmail(updatedData.email, updatedData.name);
      
      return true;
    }
  }
  
  throw new Error('Patient not found');
}

function markPatientForDeletion(patientId, providerUsername, password) {
  // Verify provider credentials first
  if (!validateProviderPassword(providerUsername, password)) {
    throw new Error('Authentication failed');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === patientId) {
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + 7); // Set deletion date to 7 days from now
      
      sheet.getRange(i + 1, 11).setValue(deletionDate);
      
      // Send deletion notification
      sendPatientDeletionEmail(data[i][5], data[i][1], deletionDate);
      
      return deletionDate;
    }
  }
  
  throw new Error('Patient not found');
}

function cancelPatientDeletion(patientId, providerUsername, password) {
  // Verify provider credentials first
  if (!validateProviderPassword(providerUsername, password)) {
    throw new Error('Authentication failed');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === patientId) {
      sheet.getRange(i + 1, 11).setValue(null); // Clear deletion date
      
      // Send cancellation confirmation
      sendDeletionCancellationEmail(data[i][5], data[i][1]);
      
      return true;
    }
  }
  
  throw new Error('Patient not found');
}

function undoPatientChanges(patientId, providerUsername, password) {
  // Verify provider credentials first
  if (!validateProviderPassword(providerUsername, password)) {
    throw new Error('Authentication failed');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PATIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === patientId) {
      const previousVersions = JSON.parse(data[i][11]);
      
      if (previousVersions.length === 0) {
        throw new Error('No previous versions available');
      }
      
      // Check if last change was within one week
      const lastVersion = previousVersions[previousVersions.length - 1];
      const lastChangeDate = new Date(lastVersion.timestamp);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      if (lastChangeDate < oneWeekAgo) {
        throw new Error('Changes cannot be undone after one week');
      }
      
      // Restore previous version
      const previousData = lastVersion.data;
      sheet.getRange(i + 1, 2).setValue(previousData.name);
      sheet.getRange(i + 1, 3).setValue(previousData.sex);
      sheet.getRange(i + 1, 4).setValue(previousData.gender);
      sheet.getRange(i + 1, 5).setValue(previousData.insuranceInfo);
      sheet.getRange(i + 1, 6).setValue(previousData.email);
      sheet.getRange(i + 1, 7).setValue(previousData.phone);
      sheet.getRange(i + 1, 8).setValue(JSON.stringify(previousData.guardians));
      sheet.getRange(i + 1, 9).setValue(JSON.stringify(previousData.medicalConditions));
      
      // Remove the last version from history
      previousVersions.pop();
      sheet.getRange(i + 1, 12).setValue(JSON.stringify(previousVersions));
      
      // Clear deletion date if exists
      sheet.getRange(i + 1, 11).setValue(null);
      
      // Send undo confirmation
      sendUndoConfirmationEmail(previousData.email, previousData.name);
      
      return true;
    }
  }
  
  throw new Error('Patient not found');
}

// Helper functions
function buildPatientObject(row) {
  Logger.log(row);
  return {
    id: row[0],
    name: row[1],
    sex: row[2],
    gender: row[3],
    insuranceInfo: row[4],
    email: row[5],
    phone: row[6],
    guardians: JSON.parse(row[7]),
    medicalConditions: JSON.parse(row[8]),
    createdAt: row[9],
    previousVersions: JSON.parse(row[11]),
    notes: row[13] || '', // Add notes field
    medicalHistory: row[14] || '' // Add medical history field
  };
}

function validateProviderPassword(username, password) {
  // Get user's login attempts
  const cache = CacheService.getUserCache();
  const attemptsKey = `login_attempts_${username}`;
  const attempts = parseInt(cache.get(attemptsKey) || '0');
  
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    throw new Error('Account locked due to too many failed attempts');
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      // Reset attempts on successful login
      cache.remove(attemptsKey);
      return true;
    }
  }
  
  // Increment failed attempts
  cache.put(attemptsKey, (attempts + 1).toString(), 3600); // 1 hour expiration
  return false;
}

// Email notification functions
function sendPatientCreationEmail(email, name) {
  const subject = 'Patient History Created';
  const body = `Dear ${name},\n\n` +
               'Your patient history has been created in the VCU Student Healthcare system.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendProviderConfirmationEmail(email, patientData) {
  const subject = 'Patient History Creation Confirmation';
  const body = `A new patient history has been created:\n\n` +
               `Patient Name: ${patientData.name}\n` +
               `Email: ${patientData.email}\n` +
               `Phone: ${patientData.phone}\n\n` +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendPatientUpdateEmail(email, name) {
  const subject = 'Patient History Updated';
  const body = `Dear ${name},\n\n` +
               'Your patient history has been updated in the VCU Student Healthcare system.\n' +
               'If you did not authorize these changes, please contact us immediately.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendPatientDeletionEmail(email, name, deletionDate) {
  const subject = 'Patient History Scheduled for Deletion';
  const body = `Dear ${name},\n\n` +
               `Your patient history is scheduled to be deleted on ${deletionDate.toLocaleDateString()}.\n` +
               'If you did not request this deletion, please contact us immediately.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendDeletionCancellationEmail(email, name) {
  const subject = 'Patient History Deletion Cancelled';
  const body = `Dear ${name},\n\n` +
               'The scheduled deletion of your patient history has been cancelled.\n' +
               'Your records will remain in our system.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}

function sendUndoConfirmationEmail(email, name) {
  const subject = 'Patient History Changes Reverted';
  const body = `Dear ${name},\n\n` +
               'Recent changes to your patient history have been undone.\n' +
               'If you did not authorize this action, please contact us immediately.\n\n' +
               'Best regards,\nVCU Student Healthcare Team';
  
  MailApp.sendEmail(email, subject, body);
}
