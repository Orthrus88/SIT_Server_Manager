function alertSuccess(message) {
    $('#alerts').append(
        '<div class="alert alert-success alert-dismissible fade show">' +
        '<strong>Success!</strong> <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' + message + '</div>');
}

function alertDanger(message) {
    $('#alerts').append(
        '<div class="alert alert-danger alert-dismissible fade show">' +
        '<strong>Warning!</strong> <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' + message + '</div>');
}
    