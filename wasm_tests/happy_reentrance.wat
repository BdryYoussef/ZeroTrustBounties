(module
  (global $balance (mut i32) (i32.const 1000))
  (func $withdraw (export "withdraw") (param $amount i32) (result i32)
    global.get $balance
    local.get $amount
    i32.sub
    global.set $balance
    global.get $balance
  )
  (func $assert_positive (export "assert_positive") (param $x i32)
    local.get $x
    i32.const 0
    i32.lt_s
    if
      unreachable
    end
  )
  (func $check_range (export "check_range") (param $x i32)
    local.get $x
    i32.const 500
    i32.gt_s
    if
      unreachable
    end
  )
)
