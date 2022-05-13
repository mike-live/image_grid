$(document).ready(function() {
	$('#zoom').slider({
			min: 0,
			max: 100,
			start: 10,
			step: 1,
			onChange: function(value) {
				$('img').height(value + 'vw');
			}
	});
	$('#crop_x').slider({
			min: 0,
			max: 100,
			start: 0,
			step: 1,
			onChange: function(value) {
				var
					$self = $(this),		  
					firstVal = $self.slider('get thumb value'),
					secVal = $self.slider('get thumb value', 'second');
				$('img').css('marginLeft', '-' + firstVal + '%');
				$('img').css('marginRight', '-' + secVal + '%');
			}
	});
	var tbl = $('#img_table');
	$('.ui.accordion').accordion();
	$('#make_table').click(function() { 
		regex_str = $('#regexp_str')[0].value;
		table_1 = make_table_2(files, regex_str);
		upd_table(table_1);
	});
});