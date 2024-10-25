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
        if (data[i][5] == username) { 
            userAppointments.push({
                hospital: data[i][0],
                doctor: data[i][1],
                date: Utilities.formatDate(data[i][2], "GMT+09:00", "MM/dd/yyyy"),
                time: Utilities.formatDate(data[i][3], "GMT+09:00","hh:mm a"),
                reason: data[i][4],
                user: data[i][5]
            });
        }
    }

    Logger.log("User Appointments: " + JSON.stringify(userAppointments)); // Debug log
    return JSON.stringify(userAppointments);
}

// Function to add a new appointment and send a confirmation email
function addAppointment(hospital, doctor, date, time, reason, username) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APPOINTMENTS_SHEET_NAME);
  
  // Append the appointment to the spreadsheet
  sheet.appendRow([hospital, doctor, date, time, reason, username]);

  // Get user's email from the profiles sheet
  const profileSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USER_DATA_SHEET_NAME);
  const profiles = profileSheet.getDataRange().getValues();
  
  let emailAddress = "";
  let name = "";
  for (let i = 1; i < profiles.length; i++) { // Skip header row
    if (profiles[i][2] == username) { // Check if username matches
      emailAddress = profiles[i][1]; // Assuming email is in the 4th column
      name = profiles[i][0];
      break;
    }
  }
  
  if (emailAddress) { // Proceed if email found
    const subject = "Appointment Confirmation";
    const message = `
      Dear ${name},
      
      Your appointment has been successfully scheduled.
      
      Details:
      - Hospital: ${hospital}
      - Doctor: ${doctor}
      - Date: ${date}
      - Time: ${time}
      - Reason: ${reason}
      
      Regards,
      VCU CS Team
    `;

    // Send the email
    MailApp.sendEmail(emailAddress, subject, message);
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
