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
    console.log("Attempting to book", CONFIG.booking.number_of_players, "people at", 
        CONFIG.booking.time, "on", CONFIG.booking.date);

    // Start booking.
    var is_headless = false;
    var browser = await puppeteer.launch({headless: is_headless});
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
    await link_line_page.waitFor(1000);
    
    var time_selector = await link_line_page.$('#criteriaTime');
    await time_selector.select(CONFIG.booking.time);
    await link_line_page.waitFor(1000);
    
    var time_selector = await link_line_page.$('#cmbPlayerCount');
    await time_selector.select(CONFIG.booking.number_of_players.toString());
    await link_line_page.waitFor(1000);

    link_line_page.click('#submitBrowse');
    await link_line_page.waitFor(3000);
    
    // "Book Now"
    var book_buttons = await link_line_page.$$('input[type="submit"]');
    await Promise.all(
        [
            book_buttons[1].click(),
            link_line_page.waitFor(3000)
        ]
     );

     // "Finish Booking"
     var book_buttons = await link_line_page.$$('input[type="submit"]');
    await Promise.all(
        [
            book_buttons[0].click(),
            link_line_page.waitFor(3000)
        ]
     );

    await browser.close();
})();