$(document).ready(function () {
    const $flashMessage = $('.flash-message');
    //console.log($flashMessage.length);

    if ($flashMessage.length) {
        setTimeout(function () {
            $flashMessage.fadeOut(1000, function () {
                $(this).remove();
            });
        }, 3000);

        $flashMessage.on('click', function () {
            $(this).remove();
        });
    }
});