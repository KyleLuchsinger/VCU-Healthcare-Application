function doGet() {
  // Serve the HTML file as a web app
  return HtmlService.createHtmlOutputFromFile('WebApp')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME); // Use IFRAME sandbox mode for better security
}

// Global variable to hold user data
const USER_DATA_SHEET_NAME = 'Profiles'; // Name of the sheet for user data
const APPOINTMENTS_SHEET_NAME = 'Appointments'; // Name of the sheet for appointments

// Function to handle user login
function login(username, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USER_DATA_SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) { // Skip header row
    if (data[i][1] === username && data[i][2] === password) {
      return { success: true, name: data[i][0] }; // Return user's name (assuming it's in the first column)
    }
  }
  return { success: false }; // Invalid credentials
}

// Function to handle user sign up
function signUp(name, username, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USER_DATA_SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  // Check for existing username
  for (let i = 1; i < data.length; i++) { // Skip header row
    if (data[i][1] === username) {
      return false; // Username already exists
    }
  }

  // Add new user to the sheet
  sheet.appendRow([name, username, password]);
  return true; // Successful sign up
}

// Function to get user appointments
function getUserAppointments(username) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const userAppointments = [];

    for (let i = 1; i < data.length; i++) { // Assuming first row is headers
        if (data[i][5] == username) { 
            userAppointments.push({
                hospital: data[i][0],
                doctor: data[i][1],
                date: Utilities.formatDate(data[i][2], "GMT+09:00", "MM/dd/yyyy"),
                time: Utilities.formatDate(data[i][2], "GMT+09:00","hh:mm a"),
                reason: data[i][4],
                user: data[i][5]
            });
        }
    }

    Logger.log("User Appointments: " + JSON.stringify(userAppointments)); // Debug log
    return JSON.stringify(userAppointments);
}


// Function to add a new appointment
function addAppointment(hospital, doctor, date, time, reason, username) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET_NAME);
  sheet.appendRow([hospital, doctor, date, time, reason, username]);
}
