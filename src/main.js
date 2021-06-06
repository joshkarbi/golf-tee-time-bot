/**
 * Golf Tee Time Booking Bot.
 * 
 * CONFIG_FILE=your_config.toml; node main.js
 */

var puppeteer = require("puppeteer");
var toml = require('toml');
var concat = require('concat-stream');
var fs = require('fs');
var strftime = require('strftime');

CONFIG = {};

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    console.log("Tee-time booker is initializing...");

    // Setup config.
    fs.createReadStream(process.env.CONFIG_FILE || 'config.toml', 
    'utf8').pipe(concat(function(data) {
        CONFIG = toml.parse(data);
    }));
    await timeout(1400);
    var booking_date = new Date();
    var temp_date_str = strftime('%B %d, %Y', 
       new Date(booking_date.setDate(booking_date.getDate()
        + CONFIG.booking.days_from_now))
    );
    var split = temp_date_str.split(' ');
    var date_form_expecting = split[0].substring(0, 3) + " " + 
        (split[1].charAt(0)=="0" ? split[1].substring(1) : split[1]) + " " +
        split[2]; 

    CONFIG.booking.date = date_form_expecting;
    console.log("Will attempt to book", CONFIG.booking.number_of_players, "people at", 
        CONFIG.booking.time, "on", CONFIG.booking.date);

    // Wait for tee times to become available.
    var now = new Date();
    var millis_till_time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
        CONFIG.schedule.start_booking_time_hour, 
        CONFIG.schedule.start_booking_time_minute, 
        CONFIG.schedule.start_booking_time_second, 0) - now;
    if (millis_till_time < 0) { millis_till_time += 86400000; }
    console.log("Sleeping until specified start time...", millis_till_time, "ms.");
    const wait = (timeToDelay) => new Promise((resolve) => setTimeout(resolve, timeToDelay));
    await wait(millis_till_time);

    // Start booking.
    var is_headless = false;
    var browser = await puppeteer.launch({headless: is_headless, args:['--no-sandbox']});
    var page = await browser.newPage();
    console.log("Loading booking site...");
    await page.goto(CONFIG.login.url);
    
    // Login.
    console.log("Logging in...");
    var member_number_input_form = await page.$('#id_username');
    await member_number_input_form.type(CONFIG.login.member_number.toString());
    var pass_form = await page.$('#id_password');
    await pass_form.type(CONFIG.login.password);
    await Promise.all(
       [
           page.click('input[type="submit"]'),
            page.waitForNavigation()
       ]
    ); 
    console.log("Logged in.");
    
    // Redirect to booking system...
    console.log("Loading tee time booking site...");
    var link = await page.$$('a[class="button white"]');
    await link[1].click();

    while (1) { if ((await browser.pages()).length == is_headless ? 2 : 3) { break; } }
    
    var pages = await browser.pages();
    var link_line_page = pages[pages.length - 1];
    await link_line_page.waitFor(3000);

    // Enter the tee time details and search for times.
    console.log("Entering tee time details...");

    var date = await link_line_page.$('#datePicker');
    await date.type(CONFIG.booking.date);
    
    link_line_page.click('#homeClub');
    await link_line_page.waitFor(2000);
    
    var time_selector = await link_line_page.$('#criteriaTime');
    await time_selector.select(CONFIG.booking.time);
    await link_line_page.waitFor(2000);
    
    var time_selector = await link_line_page.$('#cmbPlayerCount');
    await time_selector.select(CONFIG.booking.number_of_players.toString());
    await link_line_page.waitFor(3000);

    console.log("Searching for the available times....");
    link_line_page.click('#submitBrowse');
    await link_line_page.waitFor(8000);
    while (1) { if ((await link_line_page.$$('input[type="submit"]')).length > 1) { break; } }
    
    // "Book Now"
    console.log("Booking now..");
    var book_buttons = await link_line_page.$$('input[type="submit"]');
    console.log(book_buttons.length);
    await Promise.all(
        [
            book_buttons[1].click(),
            link_line_page.waitFor(9000)
        ]
     );

    // "Finish Booking"
    console.log("Finishing booking..");
    var book_buttons = await link_line_page.$$('input[type="submit"]');
    await Promise.all(
        [
            book_buttons[0].click(),
            link_line_page.waitFor(6000)
        ]
    );

    await browser.close();
})();
