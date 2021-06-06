/**
 * Golf Tee Time Booking Bot.
 * 
 * docker-compose up --build
 */

var puppeteer = require("puppeteer");
var toml = require('toml');
var concat = require('concat-stream');
var fs = require('fs');
var strftime = require('strftime');

const wait = (timeToDelay) => new Promise((resolve) => setTimeout(resolve, timeToDelay));

async function get_config() {
    var config = {};

    fs.createReadStream(process.env.CONFIG_FILE || 'config.toml', 
    'utf8').pipe(concat(function(data) {
        config = toml.parse(data);
    }));
    await wait(2000);
    var booking_date = new Date();
    var temp_date_str = strftime('%B %d, %Y', 
       new Date(booking_date.setDate(booking_date.getDate()
        + config.booking.days_from_now))
    );
    var split = temp_date_str.split(' ');
    var date_form_expecting = split[0].substring(0, 3) + " " + 
        (split[1].charAt(0)=="0" ? split[1].substring(1) : split[1]) + " " +
        split[2]; 

        config.booking.date = date_form_expecting;
    console.log("Will attempt to book", config.booking.number_of_players, "people at", 
            config.booking.time, "on", config.booking.date);

    return config;
}

async function wait_for_release_time(config) {
    var now = new Date();
    var millis_till_time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
        config.schedule.start_booking_time_hour, 
        config.schedule.start_booking_time_minute, 
        config.schedule.start_booking_time_second, 0) - now;
    if (millis_till_time < 0) { millis_till_time += 86400000; }
    
    console.log("Sleeping until specified start time...", millis_till_time, "ms.");
    await wait(millis_till_time);
}

async function launch_browser(config) {
    var browser = await puppeteer.launch({headless: false, args:['--no-sandbox']});
    var page = await browser.newPage();
    console.log("Loading booking site...");
    await page.goto(config.login.url);
    return page;
}

async function login_to_booking_system(config, page) {
    console.log("Logging in...");
    var member_number_input_form = await page.$('#id_username');
    await member_number_input_form.type(config.login.member_number.toString());
    var pass_form = await page.$('#id_password');
    await pass_form.type(config.login.password);
    await Promise.all(
       [
           page.click('input[type="submit"]'),
           page.waitForNavigation()
       ]
    ); 
    console.log("Logged in.");
}

async function redirect_to_link_line(page) {
    console.log("Loading tee time booking site...");
    var link = await page.$$('a[class="button white"]');
    await link[1].click();
    while ((await page.browser().pages()).length != 3) { }
    
    var pages = await page.browser().pages();
    var link_line_page = pages[pages.length - 1];
    await link_line_page.waitForSelector('#datePicker');
    await wait(3000);

    return link_line_page;
}

async function enter_preferred_tee_time_details(config, page) {
    console.log("Entering tee time details...");

    await page.evaluate(() => {
        let dom = document.querySelector('#datePicker');
        dom.innerHTML = "";
    });
    var date = await page.$('#datePicker');
    await date.type(config.booking.date);
    
    page.click('#homeClub');
    await wait(2000);
    
    var time_selector = await page.$('#criteriaTime');
    await time_selector.select(config.booking.time);
    await wait(2000);
    
    var time_selector = await page.$('#cmbPlayerCount');
    await time_selector.select(config.booking.number_of_players.toString());
    await wait(3000);
}

async function search_for_tee_times(config, page) {
    console.log("Searching for the available times....");
    page.click('#submitBrowse');
    await page.waitForSelector('body > .bodycontent > .bodycontentbody > .gridblock12 > #searchResults > .grid12');
    await wait(2000);
    while (1) { if ((await page.$$('input[type="submit"]')).length > 1) { break; } }
    
    // Double check we got the right date.
    const results_inner_html = await page.$eval(
        'body > .bodycontent > .bodycontentbody > .gridblock12 > #searchResults > .grid12',
        (element) => {
            return element.innerHTML
    });

    return results_inner_html.includes(config.booking.date);
}

async function book_tee_time(config, page) {
    console.log("Booking now..");
    var book_buttons = await page.$$('input[type="submit"]');
    await book_buttons[1].click();
    await page.waitForSelector('#book');

    console.log("Finishing booking..");
    var finish_booking = await page.$('#book');
    await finish_booking.click();
    console.log("Finishing boking!");
    await wait(10000);
}

async function main() {
    console.log("Tee-time booker is initializing...");

    var config = await get_config();

    await wait_for_release_time(config);

    var page = await launch_browser(config);
    
    await login_to_booking_system(config, page);

    var link_line_page = await redirect_to_link_line(page);

    await enter_preferred_tee_time_details(config, link_line_page);

    const found_tee_time = await search_for_tee_times(config, link_line_page);

    if (found_tee_time) {    
        console.log("Found results for", config.booking.date);
        await book_tee_time(config, link_line_page);
    } else {
        console.log("Could not find the specified tee time.");    
    }

    console.log("Exiting....");
    await browser.close();
}

main();
