$(window).on('load', function() {
    $.fn.exists = function () { return this.length > 0; };


    if ($('#work-items').exists()){
        $('#work-items').cubeportfolio({
            layoutMode: 'slider',
            defaultFilter: '*',
            animationType: 'fadeOutTop',
            gapHorizontal: 0,
            gapVertical: 0,
            auto: true,
            autoPauseOnHover: true,
            showNavigation: true,
            showPagination: false,
            gridAdjustment: 'responsive',
            mediaQueries: [{
                width: 1500,
                cols: 4,
            }, {
                width: 1100,
                cols: 4,
            }, {
                width: 750,
                cols: 2,
            }, {
                width: 480,
                cols: 1,
                options: {
                    caption: '',
                }
            }],
            caption: 'zoom',
            displayType: 'fadeIn',
            displayTypeSpeed: 100,

            // lightbox
            lightboxDelegate: '.cbp-lightbox',
            lightboxGallery: true,
            lightboxTitleSrc: 'data-title',
        });
    }
    if ($('#gallery').exists()) {
        $('#gallery').cubeportfolio({
            layoutMode: 'masonry',
            mediaQueries: [{
                width: 1100,
                cols: 3,
            }, {
                width: 800,
                cols: 3
            }, {
                width: 600,
                cols: 2,
            }, {
                width: 480,
                cols: 1,
                options: {
                    caption: '',
                }
            }],
            defaultFilter: '*',
            animationType: 'quicksand',
            gapHorizontal: 10,
            gapVertical: 10,
            gridAdjustment: 'responsive',
            caption: 'fadeIn',
            displayType: 'sequentially',
            displayTypeSpeed: 30,
        });
    }


});
