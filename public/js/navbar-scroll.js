window.onscroll = function () { scrollFunction() };

function scrollFunction() {
    if (document.body.scrollTop > 80 || document.documentElement.scrollTop > 80) {
        $(".navbar").css("height", "40px");
        $(".navbar-header").css("fontSize", "25px");
        $(".navbar-link").css("fontSize", "15px");
    } else {
        $(".navbar").css("height", "80px");
        $(".navbar-header").css("fontSize", "55px");
        $(".navbar-link").css("fontSize", "24px");
    }
}