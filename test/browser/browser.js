module.exports = {
    'Searching nightwatch in youtube': function (browser) {
        browser
            .url('http://www.youtube.com/')
            .pause(2000)
            .setValue('#search', 'Nightwatch js')
            .pause(2000)
            .keys(browser.Keys.ENTER)
            .pause(2000)
    },
    after(browser) {
        browser.end()
    }
}
