// Constants for sheet names and configuration
const USERS_SHEET = 'Users';
const APPOINTMENTS_SHEET = 'Appointments';
const DOCTORS_SHEET = 'Doctors';
const PRESCRIPTIONS_SHEET = 'Prescriptions';
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
        email: data[i][3]
      };
    }
  }
  return null;
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
  sheet.appendRow([username, password, fullName, email, new Date()]);
  
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

// Add these email functions to your existing email section
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
