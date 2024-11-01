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
    if (data[i][2] === username && data[i][3] === password) {
      return { success: true, name: data[i][0] }; // Return user's name (assuming it's in the first column)
    }
  }
  return { success: false }; // Invalid credentials
}

// Function to update the appointment list in the Google Sheet
function updateAppointmentList(appointments) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET_NAME);
    const currentData = sheet.getDataRange().getValues();
    const currentAppointments = new Map(); // Map to hold current appointments by their unique key

    // Load current appointments into the map for easy access
    for (let i = 1; i < currentData.length; i++) { // Skip header row
        const appointment = {
            key: currentData[i][0],
            hospital: currentData[i][1],
            doctor: currentData[i][2],
            date: currentData[i][3],
            time: currentData[i][4],
            reason: currentData[i][5],
            user: currentData[i][6]
        };
        currentAppointments.set(appointment.key, appointment);
    }

    // Process incoming appointments
    appointments.forEach(appointment => {
        if (currentAppointments.has(appointment.key)) {
            // Update the existing appointment
            const rowIndex = currentData.findIndex(row => row[0] == appointment.key);
            if (rowIndex !== -1) { sheet.getRange(1, 2, 2, 2)
                Logger.log("Edited!");
                sheet.getRange(rowIndex + 1, 1, 1, 6).setValues([[appointment.key, appointment.hospital, appointment.doctor, appointment.date, appointment.time, appointment.reason]]);
            }
            currentAppointments.delete(appointment.key); // Remove from currentAppointments since it's already accounted for
        } else {
            // If it does not exist, add the new appointment to the sheet
            sheet.appendRow([appointment.key, appointment.hospital, appointment.doctor, appointment.date, appointment.time, appointment.reason, appointment.user]);
        }
    });

    // Delete any remaining appointments in currentAppointments, which are no longer needed
    currentAppointments.forEach((_, key) => {
        const rowToDelete = currentData.findIndex(row => row[0] == key);
        if (rowToDelete !== -1) {
            sheet.deleteRow(rowToDelete + 1); // +1 for header row
        }
    });

    // Return the updated list of appointments
    return JSON.stringify(getUserAppointments()); // Get the updated list
}

// Function to handle user sign up
function signUp(name, email, username, password) { // Added email parameter
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USER_DATA_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    // Check for existing username
    for (let i = 1; i < data.length; i++) { // Skip header row
        if (data[i][1] === username) {
            return false; // Username already exists
        }
    }

    // Add new user to the sheet
    sheet.appendRow([name, email, username, password]); // Added email column
    return true; // Successful sign up
}

// Function to get user appointments
function getUserAppointments(username) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const userAppointments = [];

    for (let i = 1; i < data.length; i++) { // Assuming first row is headers
        if (data[i][6] == username) { 
            userAppointments.push({
                key: data[i][0],
                hospital: data[i][1],
                doctor: data[i][2],
                date: new Date(data[i][3]),
                time: Utilities.formatDate(data[i][4], "GMT","hh:mm a"),
                reason: data[i][5],
                user: data[i][6]
            });
        }
    }

    Logger.log("User Appointments: " + JSON.stringify(userAppointments)); // Debug log
    return JSON.stringify(userAppointments);
}

// Function to delete an appointment
function deleteAppointment(key) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET_NAME);
    const currentData = sheet.getDataRange().getValues();

    const rowToDelete = currentData.findIndex(row => row[0] === key); // Search by unique key
    if (rowToDelete !== -1) {
        sheet.deleteRow(rowToDelete + 1); // +1 for header row
    }
}

function findNearbyHospitals(address) {
    const apiKey = getKey();
    const baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    
    // First, get the coordinates of the address
    const geocodeResponse = UrlFetchApp.fetch(`${baseUrl}?address=${encodeURIComponent(address)}&key=${apiKey}`);
    const geocodeData = JSON.parse(geocodeResponse.getContentText());

    if (geocodeData.status !== "OK") {
        return []; // Return empty if the address is not valid
    }

    const location = geocodeData.results[0].geometry.location;
    const lat = location.lat;
    const lng = location.lng;

    // Now, search for nearby hospitals
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=10000&type=hospital&key=${apiKey}`;
    const placesResponse = UrlFetchApp.fetch(placesUrl);
    const placesData = JSON.parse(placesResponse.getContentText());

    // Extract hospital names from the response
    const hospitals = placesData.results.map(place => ({
        name: place.name,
        address: place.vicinity
    }));

    return hospitals;
}
