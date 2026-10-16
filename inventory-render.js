    function render() {
      $('total-items').textContent = number(items.length);
      $('total-qty').textContent = number(items.reduce((sum,item) => sum + item.quantity, 0));
      $('low-items').textContent = number(items.filter(item => item.quantity <= item.minimum).length);
      $('total-value').textContent = number(items.reduce((sum,item) => sum + item.quantity * item.price, 0)) + '원';
      const query = $('search').value.trim().toLocaleLowerCase('ko-KR');
      const shown = items.filter(item => item.name.toLocaleLowerCase('ko-KR').includes(query) && ($('filter').value === 'all' || (item.quantity <= item.minimum) === ($('filter').value === 'low')));
      $('list-count').textContent = shown.length + '개';
      $('items').replaceChildren();
      if (!shown.length) {
        const row = document.createElement('tr'); const cell = document.createElement('td');
        cell.colSpan = 5; cell.className = 'empty'; cell.textContent = items.length ? '검색 조건에 맞는 품목이 없습니다.' : '아직 등록된 품목이 없습니다. 첫 품목을 등록해 보세요.';
        row.append(cell); $('items').append(row);
      }
      shown.forEach(item => {
        const row = document.createElement('tr');
        // 사용자 입력은 textContent로 넣어 HTML 실행을 방지합니다.
        const info = document.createElement('td'); const title = document.createElement('strong'); const category = document.createElement('small');
        title.textContent = item.name; category.textContent = item.category; info.append(title,category);
        const qtyCell = document.createElement('td'); const qty = document.createElement('div'); qty.className = 'qty';
        function control(label, text, handler, disabled = false) { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', item.name + ' ' + label); button.disabled = disabled; button.addEventListener('click', handler); return button; }
        const count = document.createElement('span'); count.textContent = number(item.quantity);
        qty.append(control('1개 출고','−',() => changeQuantity(item.id,-1),item.quantity === 0),count,control('1개 입고','+',() => changeQuantity(item.id,1),item.quantity === 1000000)); qtyCell.append(qty);
        const price = document.createElement('td'); price.textContent = number(item.price) + '원';
        const state = document.createElement('td'); const badge = document.createElement('span'); const low = item.quantity <= item.minimum;
        badge.className = 'badge' + (low ? ' low' : ''); badge.textContent = low ? '재고 부족' : '충분'; state.append(badge);
        const actions = document.createElement('td'); const buttons = document.createElement('div'); buttons.className = 'actions';
        const edit = control('수정','수정',() => editItem(item.id)); edit.className = 'text-button';
        const remove = control('삭제','삭제',() => { if (confirm('“' + item.name + '” 품목을 삭제할까요?')) removeItem(item.id); }); remove.className = 'text-button danger';
        buttons.append(edit,remove); actions.append(buttons); row.append(info,qtyCell,price,state,actions); $('items').append(row);
      });
    }
