__kernel void moving_average_vec4_para(__global int4  * restrict values,
                                       __global float4 * restrict average,
                                       int length,
                                       int name_num,
                                       int width)
{
    int i,j;
    int loop_num = name_num / 4;
    int4 add_value;

    j = get_global_id(0); /* 処理する銘柄の位置計算に利用 */

    /* width-1 番目の加算処理（4銘柄同時） */
    add_value = (int4)0;
    for( i = 0; i < width; i++ ) {
        add_value += values[i*loop_num+j];
    }
    average[(width-1)*loop_num+j] = convert_float4(add_value);

    /* width ～ length-1 番目の加算処理（4銘柄同時） */
    for( i = width; i < length; i++ ) {
        add_value = add_value - values[(i-width)*loop_num+j] + values[i*loop_num+j];
        average[i*loop_num+j] = convert_float4(add_value);
    }

    /* 0 ～ width -2 番目はクリア（4銘柄同時） */
    for( i = 0; i < width-1; i++ ) {
        average[i*loop_num+j] = (float4)(0.0f);
    }

    /* width-1 ～ length-1 番目の平均結果算出（4銘柄同時） */
    for( i = width-1; i < length; i++ ) {
        average[i*loop_num+j] /= (float4)width;
    }
}
